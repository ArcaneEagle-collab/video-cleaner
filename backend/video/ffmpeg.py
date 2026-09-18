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
        self.current_frame_pos = -1

    def _seek_and_read(self, target_idx: int) -> Optional[np.ndarray]:
        """
        Reads frame at target_idx. Uses fast forward grab() if target is close
        ahead of current position, avoiding expensive demuxer resets and keyframe rewinds.
        """
        if self.total_frames > 0:
            target_idx = min(self.total_frames - 1, max(0, target_idx))
        else:
            target_idx = max(0, target_idx)

        # If target is behind current pos or too far ahead (> 45 frames), do a seek
        if self.current_frame_pos < 0 or target_idx < self.current_frame_pos or (target_idx - self.current_frame_pos) > 45:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx)
            self.current_frame_pos = target_idx

        # Fast forward grab until target
        while self.current_frame_pos < target_idx:
            if not self.cap.grab():
                break
            self.current_frame_pos += 1

        ret, frame = self.cap.read()
        self.current_frame_pos += 1
        return frame if ret and frame is not None else None

    def sample_all_frames(self) -> List[Tuple[float, np.ndarray, np.ndarray]]:
        """
        Samples frames at target_fps across the entire video.
        Returns list of (timestamp_seconds, bgr_frame, gray_frame).
        """
        sampled = []
        frame_idx = 0
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        self.current_frame_pos = 0
        
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
            self.current_frame_pos += 1
            
        return sampled

    def sample_scene_data(
        self,
        start_sec: float,
        end_sec: float,
        count: int = 5,
        pair_count: int = 3,
        dt: float = 0.12
    ) -> Tuple[List[Tuple[float, np.ndarray, np.ndarray]], List[Tuple[float, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]]:
        """
        Extracts both range frames and fine pairs for a single scene in a single forward pass.
        Eliminates duplicate seeks, keyframe rewinds, and decodes.
        """
        if end_sec <= start_sec:
            end_sec = start_sec + 0.1

        dur = end_sec - start_sec
        if dur <= dt:
            dt = max(0.04, dur * 0.5)

        # 1. Compute range target indices
        times = np.linspace(start_sec, end_sec, count)
        range_requests: List[Tuple[float, int]] = []
        for t in times:
            fn = int(round(t * self.native_fps))
            if self.total_frames > 0:
                fn = min(self.total_frames - 1, max(0, fn))
            range_requests.append((float(t), fn))

        # 2. Compute fine pair checkpoints
        if pair_count == 1:
            checkpoints = [start_sec + dur * 0.5]
        else:
            checkpoints = [start_sec + dur * (i + 1) / (pair_count + 1) for i in range(pair_count)]

        pair_requests: List[Tuple[float, int, int]] = []
        for t in checkpoints:
            t1 = min(t, max(0.0, end_sec - dt))
            t2 = t1 + dt
            f1_idx = int(round(t1 * self.native_fps))
            f2_idx = int(round(t2 * self.native_fps))
            if self.total_frames > 1:
                f1_idx = min(self.total_frames - 2, max(0, f1_idx))
                f2_idx = min(self.total_frames - 1, max(f1_idx + 1, f2_idx))
            else:
                f1_idx = max(0, f1_idx)
                f2_idx = max(0, f2_idx)
            pair_requests.append((float(t1), f1_idx, f2_idx))

        # 3. Collect unique frame numbers in ascending order
        needed_indices = set()
        for _, fn in range_requests:
            needed_indices.add(fn)
        for _, f1, f2 in pair_requests:
            needed_indices.add(f1)
            needed_indices.add(f2)

        sorted_indices = sorted(needed_indices)
        frame_cache: Dict[int, Tuple[np.ndarray, np.ndarray]] = {}

        for fn in sorted_indices:
            frame = self._seek_and_read(fn)
            if frame is not None:
                resized = cv2.resize(frame, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                frame_cache[fn] = (resized, gray)

        # 4. Assemble range frames
        frames: List[Tuple[float, np.ndarray, np.ndarray]] = []
        for t, fn in range_requests:
            if fn in frame_cache:
                r, g = frame_cache[fn]
                frames.append((t, r, g))

        # 5. Assemble fine pairs
        pairs: List[Tuple[float, np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = []
        for t1, f1, f2 in pair_requests:
            if f1 in frame_cache and f2 in frame_cache:
                r1, g1 = frame_cache[f1]
                r2, g2 = frame_cache[f2]
                pairs.append((t1, r1, g1, r2, g2))

        return frames, pairs

    def sample_range(self, start_sec: float, end_sec: float, count: int = 5) -> List[Tuple[float, np.ndarray, np.ndarray]]:
        """
        Extracts `count` evenly spaced frames within [start_sec, end_sec].
        """
        results = []
        if end_sec <= start_sec:
            end_sec = start_sec + 0.1
            
        times = np.linspace(start_sec, end_sec, count)
        for t in times:
            frame_num = int(round(t * self.native_fps))
            frame = self._seek_and_read(frame_num)
            if frame is not None:
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
            dt = max(0.04, dur * 0.5)

        # Pick checkpoints across the scene (e.g. 20%, 50%, 80%)
        if pair_count == 1:
            checkpoints = [start_sec + dur * 0.5]
        else:
            checkpoints = [start_sec + dur * (i + 1) / (pair_count + 1) for i in range(pair_count)]

        for t in checkpoints:
            t1 = min(t, max(0.0, end_sec - dt))
            t2 = t1 + dt

            f1_idx = int(round(t1 * self.native_fps))
            f2_idx = int(round(t2 * self.native_fps))

            if self.total_frames > 1:
                f1_idx = min(self.total_frames - 2, max(0, f1_idx))
                f2_idx = min(self.total_frames - 1, max(f1_idx + 1, f2_idx))
            else:
                f1_idx = max(0, f1_idx)
                f2_idx = max(0, f2_idx)

            frame1 = self._seek_and_read(f1_idx)
            frame2 = self._seek_and_read(f2_idx)

            if frame1 is not None and frame2 is not None:
                r1 = cv2.resize(frame1, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                g1 = cv2.cvtColor(r1, cv2.COLOR_BGR2GRAY)
                r2 = cv2.resize(frame2, (self.target_w, self.target_h), interpolation=cv2.INTER_AREA)
                g2 = cv2.cvtColor(r2, cv2.COLOR_BGR2GRAY)
                pairs.append((float(t1), r1, g1, r2, g2))

        return pairs

    def extract_thumbnail(self, timestamp: float, output_path: str, width: int = 320) -> bool:
        """Extract a single high-quality JPEG thumbnail at the specified timestamp."""
        frame_num = max(0, int(round(timestamp * self.native_fps)))
        frame = self._seek_and_read(frame_num)
        if frame is not None:
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
    include_audio: bool = True,
    preset: str = "veryfast"
) -> bool:
    """
    Extract a video sub-clip using FFmpeg with guaranteed frame accuracy.
    Uses two-stage seeking (coarse seek before -i for high speed, exact seek after -i
    for frame accuracy) to eliminate initial keyframe flashes and audio sync drift.
    """
    ffmpeg_cmd = get_ffmpeg_path()
    start_sec = max(0.0, start_sec)
    end_sec = max(start_sec + 0.05, end_sec)
    duration = end_sec - start_sec
    duration_str = f"{duration:.3f}"
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    audio_flags = ["-c:a", "aac", "-b:a", "192k"] if include_audio else ["-an"]

    # Two-stage seek: fast jump to keyframe 5s prior, then exact frame seek
    if start_sec > 5.0:
        coarse_seek = max(0.0, start_sec - 5.0)
        fine_seek = start_sec - coarse_seek
        cmd = [
            ffmpeg_cmd, "-y",
            "-accurate_seek",
            "-ss", f"{coarse_seek:.3f}",
            "-i", str(Path(input_path).resolve()),
            "-ss", f"{fine_seek:.3f}",
            "-t", duration_str,
            "-c:v", codec,
            "-crf", str(crf),
            "-preset", preset,
            "-pix_fmt", "yuv420p",
            "-avoid_negative_ts", "make_zero",
            *audio_flags,
            str(Path(output_path).resolve())
        ]
    else:
        cmd = [
            ffmpeg_cmd, "-y",
            "-accurate_seek",
            "-ss", f"{start_sec:.3f}",
            "-i", str(Path(input_path).resolve()),
            "-t", duration_str,
            "-c:v", codec,
            "-crf", str(crf),
            "-preset", preset,
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
    reencode: bool = True,
    codec: str = "libx264",
    crf: int = 18,
    preset: str = "veryfast"
) -> bool:
    """
    Concatenates multiple video clips into a single video file.
    Uses re-encoding concat demuxer by default to guarantee continuous PTS/DTS timestamps,
    flawless audio-video synchronization, and universal playback compatibility across all players.
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
            # Attempt stream copy concat if explicitly requested
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

        # Frame-accurate, clean re-encode concat demuxer
        cmd = [
            ffmpeg_cmd, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c:v", codec,
            "-crf", str(crf),
            "-preset", preset,
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
