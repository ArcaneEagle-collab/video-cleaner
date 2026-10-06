"""
Dense frame-accurate cut detection.

PySceneDetect with frame_skip=4-6 misses a large share of hard cuts on fast, montage-style
videos, so whole "scenes" end up containing several unrelated shots. Every later stage
(transition / image / background classification, export boundaries) then judges a mixed
scene as a single unit, which is the root cause of leaked images, false TRANSITION removals
and inaccurate cut points.

This module decodes the whole video once at a tiny resolution through FFmpeg (~60x realtime),
finds every frame-to-frame spike, and keeps only candidates where the *content* really changes
(averaged frames before vs. after differ in layout AND tonal distribution). That rejects
zoom jitter, light-leak flicker and overlay animation on a single shot.
"""
import subprocess
from typing import Callable, List, Optional, Tuple

import numpy as np

from ..video.ffprobe import get_ffmpeg_path, get_subprocess_flags

TINY_W = 48
TINY_H = 27


def decode_tiny_gray(
    video_path: str,
    progress_callback: Optional[Callable[[float], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
    total_frames_hint: int = 0,
) -> np.ndarray:
    """Returns uint8 array [n_frames, TINY_H, TINY_W] for every frame in the video."""
    cmd = [
        get_ffmpeg_path(), "-v", "error", "-nostdin",
        "-i", str(video_path),
        "-vf", f"scale={TINY_W}:{TINY_H}:flags=fast_bilinear,format=gray",
        "-f", "rawvideo", "-an", "-",
    ]
    frame_bytes = TINY_W * TINY_H
    chunks: List[np.ndarray] = []
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=frame_bytes * 512,
                            **get_subprocess_flags())
    done = 0
    try:
        assert proc.stdout is not None
        while True:
            if cancel_check and cancel_check():
                raise InterruptedError("Analysis cancelled by user during cut detection")
            raw = proc.stdout.read(frame_bytes * 1024)
            if not raw:
                break
            usable = (len(raw) // frame_bytes) * frame_bytes
            if usable:
                arr = np.frombuffer(raw[:usable], dtype=np.uint8).reshape(-1, TINY_H, TINY_W)
                chunks.append(arr.copy())
                done += arr.shape[0]
                if progress_callback and total_frames_hint > 0:
                    progress_callback(min(1.0, done / total_frames_hint))
    finally:
        try:
            if proc.stdout:
                proc.stdout.close()
        except Exception:
            pass
        if proc.poll() is None:
            proc.kill()
        proc.wait()
    if not chunks:
        return np.zeros((0, TINY_H, TINY_W), dtype=np.uint8)
    return np.concatenate(chunks, axis=0)


def _hist_distance(a: np.ndarray, b: np.ndarray) -> float:
    ha, _ = np.histogram(a, bins=16, range=(0, 256))
    hb, _ = np.histogram(b, bins=16, range=(0, 256))
    ha = ha / max(1, ha.sum())
    hb = hb / max(1, hb.sum())
    return float(0.5 * np.abs(ha - hb).sum())


def cut_metrics(frames: np.ndarray, idx: int, span: int = 3) -> Tuple[float, float]:
    """Content change across a candidate cut at frame `idx` (first frame of the new shot)."""
    n = frames.shape[0]
    b0, b1 = max(0, idx - span), idx
    a0, a1 = idx, min(n, idx + span)
    if b1 <= b0 or a1 <= a0:
        return 0.0, 0.0
    before = frames[b0:b1].astype(np.float32).mean(axis=0)
    after = frames[a0:a1].astype(np.float32).mean(axis=0)
    return float(np.abs(before - after).mean()), _hist_distance(before, after)


def find_candidate_cuts(frames: np.ndarray, min_spike: float = 14.0, ratio: float = 3.5, window: int = 12) -> List[int]:
    """Frame indices (first frame of the new shot) where the frame-to-frame diff spikes."""
    if frames.shape[0] < 3:
        return []
    f = frames.astype(np.int16)
    diff = np.abs(f[1:] - f[:-1]).mean(axis=(1, 2))
    out: List[int] = []
    n = len(diff)
    for i in range(n):
        d = diff[i]
        if d <= min_spike:
            continue
        lo, hi = max(0, i - window), min(n, i + window + 1)
        neigh = np.concatenate([diff[lo:i], diff[i + 1:hi]])
        base = float(np.median(neigh)) if len(neigh) else 0.0
        if d > ratio * max(base, 1.0):
            out.append(i + 1)
    return out


def confirmed_cut_times(
    frames: np.ndarray,
    duration: float,
    fps: float,
    min_gap_sec: float = 0.35,
) -> List[float]:
    """
    Candidate spikes filtered down to genuine shot changes (timestamps in seconds).

    Calibrated on real montage footage: shots that merely flicker (light leaks, overlay
    animation, zoom jitter) change layout by < ~25 grey levels; real shot changes are >= ~45,
    with the 28-45 band accepted only when the tonal distribution also changes clearly.
    """
    n = frames.shape[0]
    if n < 3:
        return []
    sec_per_frame = (duration / n) if duration > 0 else (1.0 / max(fps, 1.0))
    accepted: List[Tuple[int, float]] = []
    for idx in find_candidate_cuts(frames):
        spatial, hist = cut_metrics(frames, idx)
        if spatial >= 45.0 or (spatial >= 28.0 and hist >= 0.40):
            accepted.append((idx, spatial))

    # Enforce a minimum shot length: of two cuts closer than min_gap, keep the stronger one
    min_gap_frames = max(2, int(round(min_gap_sec / sec_per_frame)))
    pruned: List[Tuple[int, float]] = []
    for idx, strength in accepted:
        if pruned and idx - pruned[-1][0] < min_gap_frames:
            if strength > pruned[-1][1]:
                pruned[-1] = (idx, strength)
            continue
        pruned.append((idx, strength))
    return [round(i * sec_per_frame, 3) for i, _ in pruned]
