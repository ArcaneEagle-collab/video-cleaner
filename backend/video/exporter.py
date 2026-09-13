import os
import json
import shutil
import cv2
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional, Callable
from .ffmpeg import cut_clip, merge_clips
from .ffprobe import probe_video

def trim_blank_lead_in(video_path: str, start_sec: float, end_sec: float, max_trim_sec: float = 0.5) -> float:
    """
    Checks if the clip begins with solid black/blank frames (e.g. intro black screen)
    and advances start_sec past them to the first visible frame.
    """
    try:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            cap.release()
            return start_sec
            
        start_frame = int(start_sec * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        
        curr_frame = start_frame
        max_frame = min(int(end_sec * fps) - 5, start_frame + int(max_trim_sec * fps))
        
        while curr_frame < max_frame:
            ret, frame = cap.read()
            if not ret or frame.mean() > 4.0:
                break
            curr_frame += 1
            
        cap.release()
        if curr_frame > start_frame:
            return round(curr_frame / fps, 3)
    except Exception:
        pass
    return start_sec

def merge_contiguous_intervals(intervals: List[Tuple[float, float]], gap_threshold: float = 0.1) -> List[Tuple[float, float]]:
    """
    Merges overlapping or adjacent time intervals.
    """
    if not intervals:
        return []
    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged = [sorted_intervals[0]]
    for current in sorted_intervals[1:]:
        prev_start, prev_end = merged[-1]
        curr_start, curr_end = current
        if curr_start <= prev_end + gap_threshold:
            merged[-1] = (prev_start, max(prev_end, curr_end))
        else:
            merged.append(current)
    return merged

class VideoExporter:
    """
    Handles extracting kept clips with optional padding and merging them
    into a clean master video and individual clips.
    """
    def __init__(self, output_root: str = "outputs"):
        self.output_root = Path(output_root)
        self.output_root.mkdir(parents=True, exist_ok=True)

    def export(
        self,
        video_path: str,
        segments: List[Dict[str, Any]],
        export_settings: Dict[str, Any],
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> Dict[str, Any]:
        """
        Executes export according to user settings and manual overrides.
        """
        meta = probe_video(video_path)
        total_duration = meta.get("duration", 0.0)
        source_name = Path(video_path).stem

        # Create project output folder: outputs/{source_name}_export/
        project_dir = self.output_root / f"{source_name}_export"
        project_dir.mkdir(parents=True, exist_ok=True)

        # Default padding is 0.0 to prevent bleeding into adjacent removed sections
        padding = max(0.0, float(export_settings.get("padding_sec", 0.0)))
        export_combined = bool(export_settings.get("export_combined", True))
        export_individual = bool(export_settings.get("export_individual", True))
        quality = export_settings.get("quality", "High")
        include_audio = bool(export_settings.get("include_audio", True))
        codec = export_settings.get("codec", "libx264")

        # CRF mapping: "Original" uses visually lossless CRF 16 with guaranteed frame accuracy
        crf_map = {"Original": 16, "High": 18, "Medium": 23}
        crf = crf_map.get(quality, 18)
        reencode = True  # Always frame-accurate re-encode to prevent keyframe snapping

        # Safety inset (~5-6 frames at 24-30fps) to eliminate any transition dissolve / blur / flash ghosting
        # when bordering a segment not marked for KEEP
        safety_inset = 0.22

        # Sort segments chronologically
        sorted_segs = sorted(segments, key=lambda s: float(s.get("start", 0.0)))
        keep_intervals: List[Tuple[float, float]] = []

        for idx, seg in enumerate(sorted_segs):
            effective_action = seg.get("user_override") or seg.get("action")
            if effective_action != "KEEP":
                continue

            orig_start = float(seg["start"])
            orig_end = float(seg["end"])

            # Check if adjacent to discarded (non-KEEP) segments or video extremities
            prev_action = (sorted_segs[idx - 1].get("user_override") or sorted_segs[idx - 1].get("action")) if idx > 0 else None
            next_action = (sorted_segs[idx + 1].get("user_override") or sorted_segs[idx + 1].get("action")) if (idx < len(sorted_segs) - 1) else None

            prev_is_discarded = (prev_action != "KEEP")
            next_is_discarded = (next_action != "KEEP")

            # Calculate safe start boundary
            if prev_is_discarded:
                # Bordering a removed image/transition: apply safety inset inward into valid video; NEVER pad backwards
                start_p = orig_start + safety_inset
            else:
                # Safe boundary with another KEEP clip: allow user padding up to preceding boundary
                start_p = max(0.0, orig_start - padding)
                if idx > 0:
                    start_p = max(start_p, float(sorted_segs[idx - 1]["end"]))

            # Calculate safe end boundary
            if next_is_discarded:
                # Bordering a removed image/transition: apply safety inset inward into valid video; NEVER pad forwards
                end_p = orig_end - safety_inset
            else:
                # Safe boundary with another KEEP clip: allow user padding up to succeeding boundary
                end_p = orig_end + padding
                if total_duration > 0:
                    end_p = min(total_duration, end_p)
                if idx < len(sorted_segs) - 1:
                    end_p = min(end_p, float(sorted_segs[idx + 1]["start"]))

            if end_p - start_p >= 0.2:
                keep_intervals.append((round(start_p, 3), round(end_p, 3)))

        # Merge contiguous KEEP intervals (gap <= 0.15s)
        merged_intervals = merge_contiguous_intervals(keep_intervals, gap_threshold=0.15)

        if not merged_intervals:
            return {
                "status": "error",
                "message": "No KEEP segments selected for export. Please mark at least one segment to KEEP.",
                "clips": [],
                "combined_video": None
            }

        total_clips = len(merged_intervals)
        if progress_callback:
            progress_callback({
                "stage": f"Starting export of {total_clips} clips...",
                "percent": 5,
                "current_clip": 0,
                "total_clips": total_clips
            })

        # Save project analysis state to analysis.json
        state_file = project_dir / "analysis.json"
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump({
                "source_video": video_path,
                "video_metadata": meta,
                "segments": segments,
                "export_settings": export_settings,
                "merged_intervals": merged_intervals
            }, f, indent=2)

        individual_clips = []
        clip_paths = []

        # Extract individual clips
        for idx, (c_start, c_end) in enumerate(merged_intervals, 1):
            if progress_callback:
                pct = int(5 + ((idx - 1) / max(1, total_clips)) * 80)
                progress_callback({
                    "stage": f"Extracting clip {idx} of {total_clips}...",
                    "percent": pct,
                    "current_clip": idx,
                    "total_clips": total_clips
                })

            # Cleanly trim any intro solid black frames from clip start
            c_start = trim_blank_lead_in(video_path, c_start, c_end)
            if c_end - c_start < 0.2:
                continue

            clip_name = f"{source_name}_clip_{idx:03d}.mp4"
            clip_out = project_dir / clip_name
            
            cut_clip(
                input_path=video_path,
                output_path=str(clip_out),
                start_sec=c_start,
                end_sec=c_end,
                reencode=reencode,
                codec=codec,
                crf=crf,
                include_audio=include_audio,
                preset="veryfast"
            )

            clip_paths.append(str(clip_out))
            individual_clips.append({
                "clip_index": idx,
                "filename": clip_name,
                "filepath": str(clip_out.resolve()),
                "relative_path": f"outputs/{project_dir.name}/{clip_name}",
                "start": round(c_start, 3),
                "end": round(c_end, 3),
                "duration": round(c_end - c_start, 3),
                "size_mb": round(clip_out.stat().st_size / (1024 * 1024), 2)
            })

        combined_video_info = None
        if export_combined and clip_paths:
            if progress_callback:
                progress_callback({
                    "stage": f"Merging {len(clip_paths)} clips into clean master video...",
                    "percent": 88,
                    "current_clip": total_clips,
                    "total_clips": total_clips
                })

            clean_name = f"{source_name}_clean.mp4"
            clean_out = project_dir / clean_name

            if len(clip_paths) == 1:
                # If only one clip, copy directly
                shutil.copyfile(clip_paths[0], clean_out)
            else:
                merge_clips(
                    clip_paths,
                    str(clean_out),
                    reencode=True,
                    codec=codec,
                    crf=crf,
                    preset="veryfast"
                )

            if clean_out.exists():
                # Also save a copy directly in self.output_root if user chose a specific folder like Downloads
                target_combined_path = clean_out
                try:
                    if self.output_root.resolve() != project_dir.resolve():
                        root_clean_out = self.output_root / clean_name
                        shutil.copyfile(clean_out, root_clean_out)
                        target_combined_path = root_clean_out
                except Exception:
                    pass

                combined_video_info = {
                    "filename": target_combined_path.name,
                    "filepath": str(target_combined_path.resolve()),
                    "relative_path": f"outputs/{project_dir.name}/{clean_name}",
                    "size_mb": round(target_combined_path.stat().st_size / (1024 * 1024), 2)
                }

        # If individual clips were not explicitly requested, clean them up or keep them
        if not export_individual and combined_video_info:
            for p in clip_paths:
                try:
                    os.remove(p)
                except OSError:
                    pass
            individual_clips = []

        if progress_callback:
            progress_callback({
                "stage": "Export completed successfully!",
                "percent": 100,
                "current_clip": total_clips,
                "total_clips": total_clips
            })

        return {
            "status": "success",
            "output_dir": str(self.output_root.resolve()),
            "project_dir": str(project_dir.resolve()),
            "combined_video": combined_video_info,
            "individual_clips": individual_clips,
            "analysis_json": str(state_file.resolve()),
            "surviving_clips_count": len(merged_intervals)
        }
