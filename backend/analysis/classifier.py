import os
import time
import concurrent.futures
from typing import List, Dict, Any, Optional, Callable, Tuple
import cv2
import numpy as np

from ..video.ffprobe import probe_video
from ..video.ffmpeg import VideoFrameSampler
from .scene_detector import detect_scenes
from .static_detector import StaticImageDetector
from .zoom_detector import ZoomPanDetector
from .transition_detector import TransitionDetector
from .background_detector import SimpleBackgroundDetector
from .motion_detector import MotionDetector
from .duplicate_detector import DuplicateDetector

class VideoAnalysisPipeline:
    """
    Master pipeline that orchestrates scene detection, multi-detector analysis,
    fusion classification, and false-positive protection.
    """
    def __init__(
        self,
        sensitivity: str = "Medium",
        min_clip_duration: float = 1.2,
        min_clip_gap: float = 0.3,
        detect_static: bool = True,
        detect_zoom_pan: bool = True,
        detect_transitions: bool = True,
        detect_background: bool = True,
        detect_repeated: bool = True,
        detect_motion: bool = True,
        ai_assisted: bool = False
    ):
        self.sensitivity = sensitivity
        self.min_clip_duration = min_clip_duration
        self.min_clip_gap = min_clip_gap
        self.detect_static = detect_static
        self.detect_zoom_pan = detect_zoom_pan
        self.detect_transitions = detect_transitions
        self.detect_background = detect_background
        self.detect_repeated = detect_repeated
        self.detect_motion = detect_motion
        self.ai_assisted = ai_assisted

        # Thresholds based on sensitivity
        if sensitivity.lower() == "conservative":
            self.scene_threshold = 24.0
            self.remove_threshold = 0.85
            self.uncertain_threshold = 0.70
        elif sensitivity.lower() == "aggressive":
            self.scene_threshold = 17.0
            self.remove_threshold = 0.50
            self.uncertain_threshold = 0.35
        else: # Medium / Balanced
            self.scene_threshold = 20.0
            self.remove_threshold = 0.65
            self.uncertain_threshold = 0.45

        # Initialize detector engines
        self.static_detector = StaticImageDetector()
        self.zoom_detector = ZoomPanDetector()
        self.transition_detector = TransitionDetector()
        self.bg_detector = SimpleBackgroundDetector()
        self.motion_detector = MotionDetector()
        self.dup_detector = DuplicateDetector()

    def _analyze_scene_detectors(
        self,
        idx: int,
        s_start: float,
        s_end: float,
        frames: List[Tuple[float, np.ndarray, np.ndarray]],
        fine_pairs: List[Any]
    ) -> Tuple[Dict[str, Any], Tuple[int, float, np.ndarray]]:
        s_duration = s_end - s_start
        mid_idx = len(frames) // 2
        rep_time, rep_bgr, rep_gray = frames[mid_idx]

        # Detector 1: Static Image
        static_res = {"confidence": 0.0, "is_static": False}
        if self.detect_static:
            try:
                static_res = self.static_detector.analyze_frames(frames)
            except Exception as e:
                static_res = {"confidence": 0.0, "is_static": False, "error": str(e)}

        # Early-Exit Optimization: If scene is a pure motionless still image (SSIM >= 0.98, pixel diff < 5.0),
        # optical flow is mathematically guaranteed to be (0, 0). Skip expensive Farneback & affine estimation.
        is_dead_still = (
            static_res.get("is_static", False) and
            static_res.get("confidence", 0) >= 0.98 and
            static_res.get("max_pixel_diff", 99.0) < 5.0
        )

        if is_dead_still:
            zoom_res = {"detected": False, "confidence": 0.0, "type": "NONE", "residual_error": 5.0, "scale_change": 1.0}
            trans_res = {"detected": False, "confidence": 0.0, "type": "NONE"}
            bg_res = {"detected": False, "confidence": 0.0, "type": "NONE"}
            motion_res = {"motion_score": 0.0, "is_organic_motion": False, "local_motion_score": 0.0}
        else:
            # Precompute Farneback optical flow once for all fine pairs to share between Zoom, Background, and Motion detectors
            enriched_fine_pairs = []
            for pair in fine_pairs:
                g1, g2 = pair[2], pair[4]
                if g1 is not None and g2 is not None and g1.shape == g2.shape and g1.size > 0:
                    h_g, w_g = g1.shape
                    # Fast Farneback: downscale to ~240x135 for 3x speedup, then upsample flow vector field
                    small_w = max(160, w_g // 2)
                    small_h = max(90, h_g // 2)
                    s1 = cv2.resize(g1, (small_w, small_h), interpolation=cv2.INTER_AREA)
                    s2 = cv2.resize(g2, (small_w, small_h), interpolation=cv2.INTER_AREA)
                    small_flow = cv2.calcOpticalFlowFarneback(
                        s1, s2, None,
                        pyr_scale=0.5, levels=3, winsize=13,
                        iterations=3, poly_n=5, poly_sigma=1.2, flags=0
                    )
                    scale_x = w_g / float(small_w)
                    scale_y = h_g / float(small_h)
                    flow = cv2.resize(small_flow, (w_g, h_g), interpolation=cv2.INTER_LINEAR)
                    flow[..., 0] *= scale_x
                    flow[..., 1] *= scale_y
                    enriched_fine_pairs.append((pair[0], pair[1], pair[2], pair[3], pair[4], flow))
                else:
                    enriched_fine_pairs.append(pair)
            fine_pairs = enriched_fine_pairs

            # Detector 2: Zoom / Pan / Ken Burns (fine-pair precision tracking)
            zoom_res = {"detected": False, "confidence": 0.0, "type": "NONE", "residual_error": 5.0, "scale_change": 1.0}
            if self.detect_zoom_pan:
                try:
                    zoom_res = self.zoom_detector.analyze_fine_pairs(fine_pairs) if fine_pairs else self.zoom_detector.analyze_frames(frames)
                except Exception as e:
                    zoom_res = {"detected": False, "confidence": 0.0, "type": "NONE", "residual_error": 5.0, "scale_change": 1.0, "error": str(e)}

            # Detector 3: Transitions
            trans_res = {"detected": False, "confidence": 0.0, "type": "NONE"}
            if self.detect_transitions:
                try:
                    trans_res = self.transition_detector.analyze_frames(frames, s_duration)
                except Exception as e:
                    trans_res = {"detected": False, "confidence": 0.0, "type": "NONE", "error": str(e)}

            # Detector 4: Image With Background (cutouts, photo cards, top photo + bottom banner, blurred wings)
            bg_res = {"detected": False, "confidence": 0.0, "type": "NONE"}
            if self.detect_background:
                try:
                    bg_res = self.bg_detector.analyze_fine_pairs(fine_pairs) if fine_pairs else self.bg_detector.analyze_frames(frames)
                except Exception as e:
                    bg_res = {"detected": False, "confidence": 0.0, "type": "NONE", "error": str(e)}

            # Detector 5: Motion Analysis (Reuses precomputed fine-pair optical flow — 20x faster!)
            motion_res = {"motion_score": 1.0, "is_organic_motion": True, "local_motion_score": 0.5}
            if self.detect_motion:
                try:
                    motion_res = self.motion_detector.analyze_fine_pairs(fine_pairs, frames=frames) if fine_pairs else self.motion_detector.analyze_frames(frames)
                except Exception as e:
                    motion_res = {"motion_score": 1.0, "is_organic_motion": True, "local_motion_score": 0.5, "error": str(e)}

        scene_dict = {
            "scene_index": idx,
            "start": round(s_start, 3),
            "end": round(s_end, 3),
            "duration": round(s_duration, 3),
            "rep_time": round(rep_time, 3),
            "static_res": static_res,
            "zoom_res": zoom_res,
            "trans_res": trans_res,
            "bg_res": bg_res,
            "motion_res": motion_res
        }
        return scene_dict, (idx, rep_time, rep_gray)

    def run(
        self,
        video_path: str,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None
    ) -> Dict[str, Any]:
        """
        Executes the full video analysis pipeline with live progress reporting.
        """
        start_time = time.time()
        meta = probe_video(video_path)
        total_duration = meta.get("duration", 0.0)
        if total_duration <= 0.0:
            total_duration = 10.0

        def report(stage: str, percent: float, **kwargs):
            if progress_callback:
                progress_callback({
                    "stage": stage,
                    "percent": round(percent, 1),
                    "timestamp": round((percent / 100.0) * total_duration, 1),
                    "total_duration": round(total_duration, 1),
                    **kwargs
                })

        # Check cancel
        if cancel_check and cancel_check():
            return {"cancelled": True}

        # ----------------------------------------------------------------------
        # Stage 1: Scene Detection
        # ----------------------------------------------------------------------
        report("Scene detection", 10.0, scenes_detected=0, likely_images=0, likely_usable=0)

        def scene_progress(pct: float, cur_sec: float, scenes_count: int):
            report(
                f"Scene detection ({scenes_count} scenes found)",
                pct,
                timestamp=round(cur_sec, 1),
                scenes_detected=scenes_count,
                likely_images=0,
                likely_usable=0
            )

        try:
            raw_scenes = detect_scenes(
                video_path,
                min_scene_len_sec=0.35,
                threshold=self.scene_threshold,
                progress_callback=scene_progress,
                cancel_check=cancel_check
            )
        except InterruptedError:
            return {"cancelled": True}

        if cancel_check and cancel_check():
            return {"cancelled": True}

        # Subdivide long scenes (> 8s) into logical chunks for granular analysis
        subdivided_scenes = []
        for s_start, s_end in raw_scenes:
            dur = s_end - s_start
            if dur > 8.0:
                chunk_len = 4.5
                curr = s_start
                while curr < s_end:
                    nxt = min(curr + chunk_len, s_end)
                    if (s_end - nxt) < 1.5:
                        nxt = s_end
                    subdivided_scenes.append((curr, nxt))
                    curr = nxt
            else:
                subdivided_scenes.append((s_start, s_end))

        total_scenes = len(subdivided_scenes)
        report("Scene detection", 20.0, scenes_detected=total_scenes, likely_images=0, likely_usable=0)

        # ----------------------------------------------------------------------
        # Stage 2 to 5: Frame Extraction and Multi-Detector Analysis
        # ----------------------------------------------------------------------
        sampler = VideoFrameSampler(video_path, target_fps=3.0, max_width=480)
        scene_results = []
        representative_frames = []

        likely_images_count = 0
        likely_usable_count = 0

        workers = min(6, os.cpu_count() or 4)
        in_flight: Dict[concurrent.futures.Future, int] = {}
        window_size = max(6, workers * 3)

        def process_completed_future(fut: concurrent.futures.Future):
            nonlocal likely_images_count, likely_usable_count
            scene_res, rep_info = fut.result()
            scene_results.append(scene_res)
            representative_frames.append(rep_info)

            static_res = scene_res["static_res"]
            zoom_res = scene_res["zoom_res"]
            bg_res = scene_res["bg_res"]
            if static_res.get("confidence", 0) > 0.6 or zoom_res.get("confidence", 0) > 0.6 or bg_res.get("confidence", 0) > 0.6:
                likely_images_count += 1
            else:
                likely_usable_count += 1

            pct = 20.0 + (len(scene_results) / max(1, total_scenes)) * 65.0
            report(
                f"Analyzing scenes ({len(scene_results)}/{total_scenes})",
                pct,
                scenes_detected=total_scenes,
                likely_images=likely_images_count,
                likely_usable=likely_usable_count
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            for idx, (s_start, s_end) in enumerate(subdivided_scenes):
                if cancel_check and cancel_check():
                    sampler.close()
                    return {"cancelled": True}

                s_duration = s_end - s_start
                # High-speed sampling: 3 keyframes (start, mid, end) and 1 fine pair at midpoint
                sample_count = 3 if s_duration <= 5.0 else 4
                pair_count = 1
                frames, fine_pairs = sampler.sample_scene_data(
                    s_start, s_end,
                    count=sample_count,
                    pair_count=pair_count,
                    dt=0.10
                )

                if not frames:
                    continue

                fut = executor.submit(self._analyze_scene_detectors, idx, s_start, s_end, frames, fine_pairs)
                in_flight[fut] = idx

                # Non-blocking harvest: wait for any completed future so workers are never starved
                while len(in_flight) >= window_size:
                    if cancel_check and cancel_check():
                        sampler.close()
                        return {"cancelled": True}
                    done, _ = concurrent.futures.wait(in_flight.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
                    for f in done:
                        process_completed_future(f)
                        del in_flight[f]

            sampler.close()

            # Drain any remaining in-flight tasks
            while in_flight:
                if cancel_check and cancel_check():
                    return {"cancelled": True}
                done, _ = concurrent.futures.wait(in_flight.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
                for f in done:
                    process_completed_future(f)
                    del in_flight[f]

        # Ensure scene results are sorted by scene index
        scene_results.sort(key=lambda s: s["scene_index"])

        # Detector 6: Duplicate detection across all scenes
        dup_map = {}
        if self.detect_repeated and representative_frames:
            dup_map = self.dup_detector.find_duplicates(representative_frames)

        # ----------------------------------------------------------------------
        # Stage 6: Fusion Classification & Decision Engine
        # ----------------------------------------------------------------------
        report("Final classification", 88.0, scenes_detected=total_scenes, likely_images=likely_images_count, likely_usable=likely_usable_count)

        classified_segments = []
        for res in scene_results:
            idx = res["scene_index"]
            s_start = res["start"]
            s_end = res["end"]
            dur = res["duration"]

            static = res["static_res"]
            zoom = res["zoom_res"]
            trans = res["trans_res"]
            bg = res["bg_res"]
            motion = res["motion_res"]
            dup = dup_map.get(idx, {})

            # Classification logic
            classification = "REAL_VIDEO"
            confidence = 0.85
            reason = "Natural organic motion and frame variation detected"
            action = "KEEP"

            # 1. Check Transition
            if trans.get("detected"):
                classification = "TRANSITION"
                confidence = trans["confidence"]
                reason = f"Editing transition detected: {trans.get('reason', 'Luminance / crossfade pattern')}"
                action = "REMOVE"

            # 2. Check Ken Burns Zoom / Pan / Slide
            elif zoom.get("detected") and zoom.get("confidence", 0) >= 0.50:
                zoom_type = zoom.get("type", "IMAGE_ZOOM")
                classification = zoom_type
                confidence = zoom["confidence"]
                if "ZOOM" in zoom_type:
                    reason = f"Artificial Ken Burns zoom (Flow scale: {zoom.get('scale_change', 1.0):.3f}, planar affine fit)"
                else:
                    reason = f"Artificial Ken Burns pan/slide (Uniform planar translation, residual: {zoom.get('residual_error', 0):.2f})"
                action = "REMOVE"

            # 3. Check Image Over Background (photo card over moving background, top photo over ticker, blurred wings)
            elif bg.get("detected") and bg.get("confidence", 0) >= 0.70:
                classification = "IMAGE_ON_BACKGROUND"
                confidence = bg["confidence"]
                reason = f"Editorial image over background: {bg.get('reason', 'Image placed over backdrop')}"
                action = "REMOVE"

            # 4. Check Static Image
            elif static.get("confidence", 0) >= 0.70:
                # Protect talking heads and low-motion real video
                if (motion.get("local_motion_score", 0) > 0.10 or static.get("temporal_noise", 0) > 0.6) and static.get("avg_pixel_diff", 0) > 0.8:
                    classification = "REAL_VIDEO"
                    confidence = 0.82
                    reason = "Static camera with subtle local organic movement (talking head / living subject)"
                    action = "KEEP"
                else:
                    classification = "STATIC_IMAGE"
                    confidence = static["confidence"]
                    reason = f"Still frame sequence (SSIM: {static.get('avg_ssim', 0):.3f}, zero temporal motion)"
                    action = "REMOVE"

            # 5. Check Duplicate Still
            elif dup.get("is_duplicate"):
                classification = "STATIC_IMAGE"
                confidence = dup.get("confidence", 0.9)
                reason = f"Repeated still image slide (matched earlier scene at {dup.get('matched_timestamp', 0):.1f}s)"
                action = "REMOVE"

            # 6. Real Video vs Ambiguous
            elif (motion.get("is_organic_motion") or motion.get("motion_score", 0) > 0.35) and static.get("confidence", 0) < 0.50 and zoom.get("confidence", 0) < 0.45 and bg.get("confidence", 0) < 0.50:
                classification = "REAL_VIDEO"
                confidence = max(0.80, 1.0 - static.get("confidence", 0.0))
                reason = f"Real video footage with organic motion (score: {motion.get('motion_score', 0):.2f})"
                action = "KEEP"

            else:
                # Check if it's borderline
                if static.get("confidence", 0) > 0.45 or zoom.get("confidence", 0) > 0.45:
                    classification = "UNCERTAIN"
                    confidence = max(static.get("confidence", 0), zoom.get("confidence", 0))
                    reason = "Borderline motion characteristics — flagged for manual review"
                    action = "UNCERTAIN"
                else:
                    # Default to Real Video (protect footage from being discarded!)
                    classification = "REAL_VIDEO"
                    confidence = 0.75
                    reason = f"Natural camera video footage (motion: {motion.get('motion_score', 0):.2f})"
                    action = "KEEP"

            # Adjust action according to sensitivity threshold
            if action == "REMOVE" and confidence < self.remove_threshold:
                if confidence >= self.uncertain_threshold:
                    action = "UNCERTAIN"
                else:
                    action = "KEEP"
            elif action == "UNCERTAIN" and confidence < self.uncertain_threshold:
                action = "KEEP"

            classified_segments.append({
                "id": f"seg_{idx + 1:03d}",
                "start": s_start,
                "end": s_end,
                "duration": dur,
                "rep_time": res["rep_time"],
                "classification": classification,
                "confidence": round(confidence, 3),
                "confidence_percent": int(round(confidence * 100)),
                "action": action,
                "user_override": None, # "KEEP" or "REMOVE" if overridden by user
                "reason": reason,
                "metrics": {
                    "ssim": static.get("avg_ssim", 0),
                    "noise": static.get("temporal_noise", 0),
                    "motion_score": motion.get("motion_score", 0),
                    "local_motion": motion.get("local_motion_score", 0),
                    "zoom_scale": zoom.get("scale_change", 1.0),
                    "affine_residual": zoom.get("residual_error", 0.0)
                }
            })

        # ----------------------------------------------------------------------
        # Post-Processing: Minimum Usable Clip Duration & Gap Merging
        # ----------------------------------------------------------------------
        # Merge very small gaps between adjacent KEEP clips if gap <= min_clip_gap
        # And flag KEEP clips that are < min_clip_duration as unusable if not merged
        for i, seg in enumerate(classified_segments):
            if seg["action"] == "KEEP" and seg["duration"] < self.min_clip_duration:
                # Check if can merge with previous or next keep
                can_merge = False
                if i > 0 and classified_segments[i - 1]["action"] == "KEEP" and (seg["start"] - classified_segments[i - 1]["end"]) <= self.min_clip_gap:
                    can_merge = True
                if i < len(classified_segments) - 1 and classified_segments[i + 1]["action"] == "KEEP" and (classified_segments[i + 1]["start"] - seg["end"]) <= self.min_clip_gap:
                    can_merge = True

                if not can_merge:
                    seg["action"] = "REMOVE"
                    seg["classification"] = "SHORT_UNUSABLE"
                    seg["reason"] = f"Clip duration ({seg['duration']:.1f}s) is below minimum usable threshold ({self.min_clip_duration}s)"

        report("Complete", 100.0, scenes_detected=len(classified_segments), likely_images=sum(1 for s in classified_segments if s['action'] == 'REMOVE'), likely_usable=sum(1 for s in classified_segments if s['action'] == 'KEEP'))

        return {
            "status": "success",
            "video_metadata": meta,
            "segments": classified_segments,
            "processing_time": round(time.time() - start_time, 2),
            "settings": {
                "sensitivity": self.sensitivity,
                "min_clip_duration": self.min_clip_duration,
                "min_clip_gap": self.min_clip_gap,
                "detect_static": self.detect_static,
                "detect_zoom_pan": self.detect_zoom_pan,
                "detect_transitions": self.detect_transitions,
                "detect_background": self.detect_background,
                "detect_repeated": self.detect_repeated,
                "detect_motion": self.detect_motion,
                "ai_assisted": self.ai_assisted
            }
        }
