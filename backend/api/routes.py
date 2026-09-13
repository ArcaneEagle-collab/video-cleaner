import os
import sys
import shutil
import uuid
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Query, Header
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from pydantic import BaseModel

from ..video.ffprobe import probe_video, get_ffmpeg_path, get_ffprobe_path
from ..analysis.classifier import VideoAnalysisPipeline
from ..video.exporter import VideoExporter
from ..analytics.store import record_event, get_metrics_summary
from ..config import (
    get_temp_dir,
    get_appdata_dir,
    get_logs_dir,
    get_default_outputs_dir,
    load_settings,
    save_settings,
    get_temp_size_bytes,
    clear_temp_files
)
from .websocket import ws_manager

router = APIRouter(prefix="/api")
dashboard_router = APIRouter(prefix="/dashboard")

def get_upload_dir() -> Path:
    p = get_temp_dir() / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_outputs_dir() -> Path:
    settings = load_settings()
    configured = settings.get("output_dir")
    if configured and Path(configured).is_absolute():
        p = Path(configured)
    else:
        p = get_default_outputs_dir()
    p.mkdir(parents=True, exist_ok=True)
    return p

# Backward compatibility references
UPLOAD_DIR = get_upload_dir()
OUTPUTS_DIR = get_outputs_dir()
TEST_ASSETS_DIR = Path("test_assets")
TEST_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

class AnalysisRequest(BaseModel):
    video_path: str
    task_id: Optional[str] = None
    sensitivity: str = "Medium"
    min_clip_duration: float = 1.2
    min_clip_gap: float = 0.3
    detect_static: bool = True
    detect_zoom_pan: bool = True
    detect_transitions: bool = True
    detect_background: bool = True
    detect_repeated: bool = True
    detect_motion: bool = True
    ai_assisted: bool = False

class ExportRequest(BaseModel):
    video_path: str
    segments: List[Dict[str, Any]]
    export_combined: bool = True
    export_individual: bool = True
    quality: str = "High"
    include_audio: bool = True
    codec: str = "libx264"
    padding_sec: float = 0.0
    output_dir: Optional[str] = None

# In-memory store for active / completed analysis results
analysis_store: Dict[str, Any] = {}

@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Accepts video upload and immediately probes metadata.
    Supported: MP4, MOV, MKV, WEBM, AVI.
    """
    allowed_extensions = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format: '{file_ext}'. Please upload MP4, MOV, MKV, WEBM, or AVI."
        )

    # Unique destination filename
    safe_name = f"{Path(file.filename).stem}_{uuid.uuid4().hex[:8]}{file_ext}"
    dest_path = UPLOAD_DIR / safe_name

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    # Probe metadata
    try:
        meta = probe_video(str(dest_path))
        meta["upload_id"] = safe_name
        meta["stream_url"] = f"/api/stream/{safe_name}"
        return {
            "status": "success",
            "message": "Video uploaded successfully",
            "metadata": meta
        }
    except Exception as e:
        if dest_path.exists():
            os.remove(dest_path)
        raise HTTPException(status_code=400, detail=f"Invalid or corrupt video file: {str(e)}")

@router.get("/stream/{filename}")
async def stream_video(filename: str):
    """
    Video streaming endpoint supporting Range headers for smooth browser seeking.
    """
    # Check uploads, outputs, test_assets, and user Downloads
    current_out = get_outputs_dir()
    downloads_dir = Path.home() / "Downloads"
    search_paths = [
        get_upload_dir() / filename,
        TEST_ASSETS_DIR / filename,
        current_out / filename,
        downloads_dir / filename,
        Path("outputs") / filename,
    ]
    # Check recursively in outputs and downloads subdirectories
    for base in [current_out, downloads_dir, Path("outputs")]:
        if base.exists():
            for p in base.glob(f"**/{filename}"):
                search_paths.append(p)

    target_file: Optional[Path] = None
    for p in search_paths:
        if p.exists() and p.is_file():
            target_file = p
            break

    if not target_file:
        raise HTTPException(status_code=404, detail="Video file not found")

    file_size = target_file.stat().st_size
    mime_type = "video/mp4"
    if target_file.suffix.lower() == ".webm":
        mime_type = "video/webm"
    elif target_file.suffix.lower() == ".mkv":
        mime_type = "video/x-matroska"

    return FileResponse(
        path=target_file,
        media_type=mime_type,
        filename=target_file.name
    )

def run_analysis_task(task_id: str, req: AnalysisRequest):
    """
    Synchronous analysis worker running in background thread.
    Broadcasts live updates via WebSocket.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    pipeline = VideoAnalysisPipeline(
        sensitivity=req.sensitivity,
        min_clip_duration=req.min_clip_duration,
        min_clip_gap=req.min_clip_gap,
        detect_static=req.detect_static,
        detect_zoom_pan=req.detect_zoom_pan,
        detect_transitions=req.detect_transitions,
        detect_background=req.detect_background,
        detect_repeated=req.detect_repeated,
        detect_motion=req.detect_motion,
        ai_assisted=req.ai_assisted
    )

    def progress_callback(data: Dict[str, Any]):
        msg = {
            "type": "progress",
            "task_id": task_id,
            **data
        }
        loop.run_until_complete(ws_manager.broadcast(msg))

    def cancel_check() -> bool:
        return ws_manager.is_task_cancelled(task_id)

    try:
        result = pipeline.run(
            video_path=req.video_path,
            progress_callback=progress_callback,
            cancel_check=cancel_check
        )

        if result.get("cancelled"):
            loop.run_until_complete(ws_manager.broadcast({
                "type": "cancelled",
                "task_id": task_id,
                "message": "Analysis cancelled by user"
            }))
            analysis_store[task_id] = {"status": "cancelled"}
        else:
            analysis_store[task_id] = {
                "status": "completed",
                "result": result
            }
            loop.run_until_complete(ws_manager.broadcast({
                "type": "completed",
                "task_id": task_id,
                "result": result
            }))
    except Exception as e:
        loop.run_until_complete(ws_manager.broadcast({
            "type": "error",
            "task_id": task_id,
            "error": str(e)
        }))
        analysis_store[task_id] = {"status": "error", "error": str(e)}
    finally:
        ws_manager.clear_task(task_id)
        loop.close()

@router.post("/analyze")
async def start_analysis(req: AnalysisRequest, background_tasks: BackgroundTasks):
    """
    Starts background video analysis.
    """
    if not Path(req.video_path).exists():
        raise HTTPException(status_code=404, detail="Specified video file does not exist")

    task_id = req.task_id or uuid.uuid4().hex
    analysis_store[task_id] = {"status": "running"}

    background_tasks.add_task(run_analysis_task, task_id, req)

    return {
        "status": "started",
        "task_id": task_id,
        "message": "Video analysis started in background"
    }

@router.post("/cancel")
async def cancel_analysis(task_id: str = Form(...)):
    """
    Cancels an ongoing analysis task.
    """
    ws_manager.cancel_task(task_id)
    return {"status": "success", "message": f"Cancellation requested for task {task_id}"}

@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    """
    Polling fallback for task status if WebSocket is unavailable.
    """
    if task_id not in analysis_store:
        raise HTTPException(status_code=404, detail="Task ID not found")
    return analysis_store[task_id]

@router.post("/export")
async def export_video(req: ExportRequest):
    """
    Trims and exports kept video clips and merged master video.
    Supports custom or default Downloads output directory and broadcasts live progress.
    """
    if not Path(req.video_path).exists():
        raise HTTPException(status_code=404, detail="Video file does not exist")

    output_root = req.output_dir.strip() if (req.output_dir and req.output_dir.strip()) else str(get_outputs_dir())
    exporter = VideoExporter(output_root=output_root)

    loop = asyncio.get_running_loop()

    def progress_callback(data: Dict[str, Any]):
        msg = {
            "type": "export_progress",
            **data
        }
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(msg), loop)

    try:
        export_result = await asyncio.to_thread(
            exporter.export,
            video_path=req.video_path,
            segments=req.segments,
            export_settings={
                "export_combined": req.export_combined,
                "export_individual": req.export_individual,
                "quality": req.quality,
                "include_audio": req.include_audio,
                "codec": req.codec,
                "padding_sec": req.padding_sec
            },
            progress_callback=progress_callback
        )
        return export_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.get("/projects")
async def list_projects():
    """
    Lists existing exported projects and analysis state files.
    """
    projects = []
    seen = set()
    search_dirs = [get_outputs_dir(), Path("outputs")]
    for base in search_dirs:
        if not base.exists():
            continue
        for p in base.glob("*_export/analysis.json"):
            if str(p.resolve()) in seen:
                continue
            seen.add(str(p.resolve()))
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    projects.append({
                        "project_name": p.parent.name,
                        "source_video": data.get("source_video"),
                        "created_at": p.stat().st_mtime,
                        "surviving_clips": len(data.get("merged_intervals", [])),
                        "analysis_file": str(p.resolve())
                    })
            except Exception:
                pass
    return {"projects": sorted(projects, key=lambda x: x["created_at"], reverse=True)}

# In-memory cache for test videos: {filename: (mtime, metadata)}
_test_videos_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}

@router.get("/test-videos")
async def get_test_videos():
    """
    Lists pre-generated test videos for instant testing.
    Caches probed metadata by file modification time to prevent repeated ffprobe spawning.
    """
    videos = []
    for f in sorted(TEST_ASSETS_DIR.glob("*.mp4")):
        try:
            mtime = f.stat().st_mtime
            if f.name in _test_videos_cache and _test_videos_cache[f.name][0] == mtime:
                meta = _test_videos_cache[f.name][1]
            else:
                meta = probe_video(str(f))
                meta["upload_id"] = f.name
                meta["stream_url"] = f"/api/stream/{f.name}"
                _test_videos_cache[f.name] = (mtime, meta)

            videos.append({
                "name": f.stem.replace("_", " ").title(),
                "filename": f.name,
                "filepath": str(f.resolve()),
                "metadata": meta
            })
        except Exception:
            pass
    return {"test_videos": videos}

@router.get("/settings")
async def get_settings():
    return load_settings()

@router.post("/settings")
async def update_settings(payload: Dict[str, Any]):
    updated = save_settings(payload)
    return {"status": "success", "settings": updated}

@router.get("/system/info")
async def get_system_info():
    import platform
    ffmpeg_bin = ""
    ffprobe_bin = ""
    try:
        ffmpeg_bin = get_ffmpeg_path()
    except Exception:
        pass
    try:
        ffprobe_bin = get_ffprobe_path()
    except Exception:
        pass

    temp_bytes = get_temp_size_bytes()
    settings = load_settings()
    return {
        "app_name": "Video Cleaner",
        "version": "1.0.0",
        "author": "Amna",
        "os": platform.platform(),
        "python_version": platform.python_version(),
        "ffmpeg_path": ffmpeg_bin,
        "ffprobe_path": ffprobe_bin,
        "ffmpeg_status": "ready" if ffmpeg_bin and ffprobe_bin else "missing",
        "temp_dir": settings.get("temp_dir"),
        "temp_size_bytes": temp_bytes,
        "temp_size_mb": round(temp_bytes / (1024 * 1024), 2),
        "output_dir": settings.get("output_dir"),
        "logs_dir": str(get_logs_dir().resolve()),
        "analytics_enabled": settings.get("analytics_enabled", False)
    }

@router.post("/system/clean-temp")
async def trigger_clean_temp():
    result = clear_temp_files()
    return {"status": "success", **result}

@router.get("/system/logs")
async def get_system_logs(lines: int = Query(default=100, le=500)):
    log_file = get_logs_dir() / "backend.log"
    if not log_file.exists():
        return {"logs": ["Log file is clean / no recent backend events."]}
    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
            recent = all_lines[-lines:] if len(all_lines) > lines else all_lines
            return {"logs": [line.rstrip() for line in recent]}
    except Exception as e:
        return {"logs": [f"Error reading log file: {str(e)}"]}

@router.post("/system/clear-logs")
async def clear_system_logs():
    log_file = get_logs_dir() / "backend.log"
    if log_file.exists():
        try:
            with open(log_file, "w", encoding="utf-8") as f:
                f.write("")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to clear logs: {e}")
    return {"status": "success", "message": "Logs cleared successfully"}

# --- Anonymous Analytics & Telemetry Ingestion ---

class AnalyticsEventPayload(BaseModel):
    install_id: str
    event_name: str
    app_version: str = "1.0.0"
    metadata: Optional[Dict[str, Any]] = None

@router.post("/events")
async def ingest_analytics_event(payload: AnalyticsEventPayload):
    settings = load_settings()
    # Check if analytics is enabled (allowed to report disabled event)
    if not settings.get("analytics_enabled", True) and payload.event_name != "analytics_disabled":
        return {"status": "ignored", "reason": "analytics_disabled"}

    success = record_event(
        install_id=payload.install_id,
        event_name=payload.event_name,
        app_version=payload.app_version,
        os_platform="Windows",
        metadata=payload.metadata
    )
    return {"status": "recorded" if success else "invalid"}

# --- Private Developer Analytics Dashboard ---

def get_dashboard_html_path() -> Path:
    if getattr(sys, "frozen", False):
        base_dir = Path(sys.executable).parent
        candidates = [
            base_dir / "_internal" / "backend" / "analytics" / "dashboard.html",
            base_dir / "backend" / "analytics" / "dashboard.html",
        ]
        for c in candidates:
            if c.exists():
                return c
    return Path(__file__).resolve().parent.parent / "analytics" / "dashboard.html"

@dashboard_router.get("", response_class=HTMLResponse)
@dashboard_router.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    dash_file = get_dashboard_html_path()
    if not dash_file.exists():
        raise HTTPException(status_code=404, detail="Dashboard template not found.")
    return HTMLResponse(content=dash_file.read_text(encoding="utf-8"))

@dashboard_router.get("/api/metrics")
async def get_dashboard_metrics(authorization: Optional[str] = Header(None)):
    admin_password = os.environ.get("ANALYTICS_ADMIN_PASSWORD", "amna-admin")
    valid = False
    if authorization:
        token = authorization.replace("Bearer ", "").replace("Basic ", "").strip()
        if token == admin_password:
            valid = True

    if not valid:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized. Enter developer admin password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return get_metrics_summary()

