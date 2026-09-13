import os
import sys
import json
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

def get_subprocess_flags() -> Dict[str, Any]:
    """
    Returns platform-specific subprocess kwargs to prevent console windows
    from popping up on Windows when executing FFprobe or FFmpeg.
    """
    kwargs: Dict[str, Any] = {}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
        kwargs["startupinfo"] = startupinfo
    return kwargs

def _find_bundled_binary(binary_name: str) -> Optional[str]:
    ext = ".exe" if os.name == "nt" else ""
    target_name = f"{binary_name}{ext}"
    
    # 1. Direct environment variable (e.g. FFMPEG_PATH / FFPROBE_PATH)
    env_key = f"{binary_name.upper()}_PATH"
    if os.environ.get(env_key) and Path(os.environ[env_key]).exists():
        return os.environ[env_key]

    # 2. Directory environment variable (e.g. FFMPEG_DIR)
    ffmpeg_dir = os.environ.get("FFMPEG_DIR")
    if ffmpeg_dir:
        cand = Path(ffmpeg_dir) / target_name
        if cand.exists():
            return str(cand.resolve())

    # 3. Look relative to sys.executable (packaged PyInstaller location)
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates = [
            exe_dir / target_name,
            exe_dir / "ffmpeg" / target_name,
            exe_dir.parent / "ffmpeg" / target_name,
            exe_dir.parent / "bin" / target_name,
            exe_dir.parent / target_name,
        ]
        for cand in candidates:
            if cand.exists():
                return str(cand.resolve())

    # 4. Look relative to source code directory / project root
    try:
        project_root = Path(__file__).resolve().parents[2]
        candidates = [
            project_root / "resources" / "ffmpeg" / target_name,
            project_root / "bin" / target_name,
            project_root / "ffmpeg" / target_name,
        ]
        for cand in candidates:
            if cand.exists():
                return str(cand.resolve())
    except Exception:
        pass

    # 5. Look in current working directory
    for cand in [Path("resources/ffmpeg") / target_name, Path("bin") / target_name]:
        if cand.exists():
            return str(cand.resolve())

    # 6. Fall back to system PATH
    return shutil.which(binary_name)

def get_ffprobe_path() -> str:
    path = _find_bundled_binary("ffprobe")
    if not path:
        raise FileNotFoundError("ffprobe executable not found. Bundled FFmpeg or system PATH is required.")
    return path

def get_ffmpeg_path() -> str:
    path = _find_bundled_binary("ffmpeg")
    if not path:
        raise FileNotFoundError("ffmpeg executable not found. Bundled FFmpeg or system PATH is required.")
    return path

def probe_video(video_path: str) -> Dict[str, Any]:
    """
    Extracts comprehensive metadata from a video file using ffprobe.
    """
    path_obj = Path(video_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"Video file does not exist: {video_path}")

    ffprobe_cmd = get_ffprobe_path()
    cmd = [
        ffprobe_cmd,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path_obj.resolve())
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
            **get_subprocess_flags()
        )
        data = json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"FFprobe failed to inspect video: {e.stderr}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse FFprobe JSON output: {e}")

    format_info = data.get("format", {})
    streams = data.get("streams", [])

    video_stream: Optional[Dict[str, Any]] = None
    audio_stream: Optional[Dict[str, Any]] = None

    for stream in streams:
        codec_type = stream.get("codec_type")
        if codec_type == "video" and not video_stream:
            video_stream = stream
        elif codec_type == "audio" and not audio_stream:
            audio_stream = stream

    if not video_stream:
        raise ValueError(f"No video stream found in file: {video_path}")

    # Calculate FPS
    fps = 30.0
    r_fps = video_stream.get("r_frame_rate", "30/1")
    avg_fps = video_stream.get("avg_frame_rate", "30/1")
    for rate_str in (avg_fps, r_fps):
        if rate_str and "/" in rate_str:
            num, den = rate_str.split("/", 1)
            try:
                num_val = float(num)
                den_val = float(den)
                if den_val > 0:
                    fps = round(num_val / den_val, 3)
                    break
            except ValueError:
                pass

    # Duration
    duration = 0.0
    if "duration" in video_stream:
        try:
            duration = float(video_stream["duration"])
        except (ValueError, TypeError):
            pass
    if duration <= 0.0 and "duration" in format_info:
        try:
            duration = float(format_info["duration"])
        except (ValueError, TypeError):
            pass

    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))
    codec_name = video_stream.get("codec_name", "unknown")
    file_size = int(format_info.get("size", path_obj.stat().st_size))
    bitrate = int(format_info.get("bit_rate", 0))

    has_audio = audio_stream is not None
    audio_codec = audio_stream.get("codec_name") if audio_stream else None

    # Frame count estimate
    nb_frames = int(video_stream.get("nb_frames", 0))
    if nb_frames == 0 and duration > 0 and fps > 0:
        nb_frames = int(duration * fps)

    return {
        "filename": path_obj.name,
        "filepath": str(path_obj.resolve()),
        "duration": duration,
        "width": width,
        "height": height,
        "resolution": f"{width}x{height}",
        "fps": fps,
        "file_size": file_size,
        "file_size_mb": round(file_size / (1024 * 1024), 2),
        "codec_name": codec_name,
        "has_audio": has_audio,
        "audio_codec": audio_codec,
        "bitrate": bitrate,
        "nb_frames": nb_frames
    }
