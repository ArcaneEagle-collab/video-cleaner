import os
import subprocess
import tempfile
import cv2
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Generator, Tuple, Optional
from .ffprobe import get_ffmpeg_path, get_subprocess_flags

class VideoFrameSampler:
    """
    Efficient frame sampler using OpenCV with resolution downscaling
    to enable high-speed computer vision analysis without disk thrashing.
    """
    def __init__(self, video_path: str, target_fps: float = 3.0, max_width: int = 480):
        self.video_path = video_path
        self.target_fps = target_fps
        self.max_width = max_width
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open video with OpenCV: {video_path}")
        
        self.native_fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        self.duration = self.total_frames / self.native_fps if self.native_fps > 0 else 0.0
        self.step = max(1, int(round(self.native_fps / self.target_fps)))
        
        orig_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920)
        orig_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080)
        if orig_w > self.max_width:
            scale = self.max_width / orig_w
            self.target_w = self.max_width
            self.target_h = int(orig_h * scale)
        else:
            self.target_w = orig_w
            self.target_h = orig_h

    def sample_all_frames(self) -> List[Tuple[float, np.ndarray, np.ndarray]]:
        """
        Samples frames at target_fps across the entire video.
        Returns list of (timestamp_seconds, bgr_frame, gray_frame).
        """
        sampled = []
        frame_idx = 0
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        
        while True:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                break
                
            if frame_idx % self.step == 0:
                timestamp = frame_idx / self.native_fps
                resized = cv2.resize(frame, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                sampled.append((timestamp, resized, gray))
                
            frame_idx += 1
            
        return sampled

    def sample_range(self, start_sec: float, end_sec: float, count: int = 5) -> List[Tuple[float, np.ndarray, np.ndarray]]:
        """
        Extracts `count` evenly spaced frames within [start_sec, end_sec].
        """
        results = []
        if end_sec <= start_sec:
            end_sec = start_sec + 0.1
            
        times = np.linspace(start_sec, end_sec, count)
        for t in times:
            frame_num = int(t * self.native_fps)
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            ret, frame = self.cap.read()
            if ret and frame is not None:
                resized = cv2.resize(frame, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                results.append((float(t), resized, gray))
        return results

    def sample_fine_pairs(self, start_sec: float, end_sec: float, pair_count: int = 3, dt: float = 0.12) -> List[Tuple[float, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
        """
        Samples frame pairs (t, f1_bgr, f1_gray, f2_bgr, f2_gray) separated by dt seconds (~2-4 frames).
        This provides the ideal temporal window for Farneback optical flow and 2D affine planar estimation.
        """
        pairs = []
        dur = end_sec - start_sec
        if dur <= dt:
            dt = dur * 0.5

        # Pick checkpoints across the scene (e.g. 20%, 50%, 80%)
        if pair_count == 1:
            checkpoints = [start_sec + dur * 0.5]
        else:
            checkpoints = [start_sec + dur * (i + 1) / (pair_count + 1) for i in range(pair_count)]

        for t in checkpoints:
            t1 = min(t, max(0.0, end_sec - dt))
            t2 = t1 + dt

            f1_idx = int(t1 * self.native_fps)
            f2_idx = int(t2 * self.native_fps)

            self.cap.set(cv2.CAP_PROP_POS_FRAMES, f1_idx)
            ret1, frame1 = self.cap.read()
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, f2_idx)
            ret2, frame2 = self.cap.read()

            if ret1 and ret2 and frame1 is not None and frame2 is not None:
                r1 = cv2.resize(frame1, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                g1 = cv2.cvtColor(r1, cv2.COLOR_BGR2GRAY)
                r2 = cv2.resize(frame2, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                g2 = cv2.cvtColor(r2, cv2.COLOR_BGR2GRAY)
                pairs.append((float(t1), r1, g1, r2, g2))

        return pairs

    def extract_thumbnail(self, timestamp: float, output_path: str, width: int = 320) -> bool:
        """Extract a single high-quality JPEG thumbnail at the specified timestamp."""
        frame_num = max(0, int(timestamp * self.native_fps))
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = self.cap.read()
        if ret and frame is not None:
            h, w = frame.shape[:2]
            scale = width / float(w)
            resized = cv2.resize(frame, (width, int(h * scale)), interpolation=cv2.INTER_AREA)
            cv2.imwrite(output_path, resized, [cv2.IMWRITE_JPEG_QUALITY, 85])
            return True
        return False

    def close(self):
        if self.cap.isOpened():
            self.cap.release()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def cut_clip(
    input_path: str,
    output_path: str,
    start_sec: float,
    end_sec: float,
    reencode: bool = True,
    codec: str = "libx264",
    crf: int = 18,
    include_audio: bool = True
) -> bool:
    """
    Extract a video sub-clip using FFmpeg with guaranteed frame accuracy.
    Uses re-encoding with fast preset and high fidelity (CRF) to prevent
    keyframe snapping or audio desync at arbitrary cut boundaries.
    """
    ffmpeg_cmd = get_ffmpeg_path()
    start_str = f"{max(0.0, start_sec):.3f}"
    duration_str = f"{max(0.01, end_sec - start_sec):.3f}"
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    audio_flags = ["-c:a", "aac", "-b:a", "192k"] if include_audio else ["-an"]

    # Frame-accurate extraction: seek with -ss before -i for fast decoding to keyframe,
    # re-encode to target cut point, and reset timestamps with -avoid_negative_ts make_zero
    cmd = [
        ffmpeg_cmd, "-y",
        "-ss", start_str,
        "-i", str(Path(input_path).resolve()),
        "-t", duration_str,
        "-c:v", codec,
        "-crf", str(crf),
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-avoid_negative_ts", "make_zero",
        *audio_flags,
        str(Path(output_path).resolve())
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **get_subprocess_flags())
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed to extract clip: {result.stderr}")
    return True


def merge_clips(
    clip_paths: List[str],
    output_path: str,
    reencode: bool = False
) -> bool:
    """
    Concatenates multiple video clips into a single video file.
    Ensures clean timestamp generation and avoids seam glitches.
    """
    if not clip_paths:
        raise ValueError("No clip paths provided for merging.")
        
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_cmd = get_ffmpeg_path()
    
    # Create temporary concat demuxer file
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        concat_file = f.name
        for p in clip_paths:
            escaped_path = Path(p).resolve().as_posix().replace("'", "'\\''")
            f.write(f"file '{escaped_path}'\n")

    try:
        if not reencode:
            # Stream copy concat with timestamp re-basing and genpts to eliminate seam flashes
            cmd = [
                ffmpeg_cmd, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                "-fflags", "+genpts",
                str(Path(output_path).resolve())
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **get_subprocess_flags())
            if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1024:
                return True

        # Re-encode concat if stream-copy fails or is requested
        cmd = [
            ffmpeg_cmd, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-avoid_negative_ts", "make_zero",
            str(Path(output_path).resolve())
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **get_subprocess_flags())
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg failed to merge clips: {res.stderr}")
        return True
    finally:
        if os.path.exists(concat_file):
            try:
                os.remove(concat_file)
            except OSError:
                pass
