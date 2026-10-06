import cv2
import numpy as np
from typing import List, Tuple, Dict, Any

class TransitionDetector:
    """
    Detects editing transitions such as Dip to Black, Dip to White, Crossfade, Flash, and Wipes.
    """
    def __init__(self):
        pass

    def analyze_frames(self, frames: List[Tuple[float, np.ndarray, np.ndarray]], duration: float) -> Dict[str, Any]:
        """
        Analyzes a sequence of frames and scene duration.
        """
        if len(frames) < 2:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "reason": "Insufficient frames"}

        # Transitions typically last up to 5.5 seconds
        if duration > 5.5:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "reason": "Duration exceeds transition limits"}

        luminances = []
        edge_energies = []
        hist_diffs = []

        for i, (_, bgr, gray) in enumerate(frames):
            try:
                if gray is None or gray.size == 0:
                    continue
                mean_lum = float(np.mean(gray))
                luminances.append(mean_lum)

                # Edge energy (Laplacian variance)
                lap = cv2.Laplacian(gray, cv2.CV_64F)
                edge_energy = float(np.var(lap))
                edge_energies.append(edge_energy)

                if i > 0:
                    _, _, prev_gray = frames[i - 1]
                    if prev_gray is not None and prev_gray.size > 0:
                        h1 = cv2.calcHist([prev_gray], [0], None, [32], [0, 256])
                        h2 = cv2.calcHist([gray], [0], None, [32], [0, 256])
                        cv2.normalize(h1, h1, 0, 1, cv2.NORM_MINMAX)
                        cv2.normalize(h2, h2, 0, 1, cv2.NORM_MINMAX)
                        corr = float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))
                        hist_diffs.append(1.0 - corr)
            except Exception:
                continue

        if not luminances:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "reason": "No valid frames"}

        min_lum = min(luminances)
        max_lum = max(luminances)
        avg_lum = float(np.mean(luminances))
        avg_edge = float(np.mean(edge_energies))
        min_edge = min(edge_energies) if edge_energies else 0.0
        max_edge = max(edge_energies) if edge_energies else 0.0

        # 1. Dip to Black / Fade to Black / Black Screen
        # True black dip: whole frame luminance fades to pitch black / near black with low edge detail,
        # or average scene luminance is very dark with no visible edges.
        if (min_lum < 10.0 and avg_edge < 25.0) or (avg_lum < 16.0 and avg_edge < 18.0) or (min_lum < 4.0 and duration <= 1.5):
            confidence = min(0.98, 0.82 + (16.0 - min_lum) * 0.015)
            return {
                "detected": True,
                "type": "DIP_TO_BLACK",
                "confidence": round(confidence, 3),
                "reason": f"Luminance dropped to black ({min_lum:.1f}, edge: {avg_edge:.1f})"
            }

        # 2. Dip to White / Flash / White Screen
        # True white flash: whole frame washes out to pure white with loss of edge contrast
        if (max_lum > 248.0 and avg_edge < 28.0) or (avg_lum > 240.0 and avg_edge < 22.0) or (max_lum > 252.0 and duration <= 0.6):
            confidence = min(0.98, 0.82 + (max_lum - 240.0) * 0.015)
            return {
                "detected": True,
                "type": "DIP_TO_WHITE" if duration > 0.4 else "FLASH",
                "confidence": round(confidence, 3),
                "reason": f"Luminance spiked to white ({max_lum:.1f}, edge: {avg_edge:.1f})"
            }

        # 3. Crossfade / Dissolve: low edge sharpness at transition midpoint with progressive histogram shift
        avg_hist_diff = float(np.mean(hist_diffs)) if hist_diffs else 0.0
        if avg_hist_diff > 0.25 and (avg_edge < 35.0 and (max_edge > 0 and min_edge / max_edge < 0.40)) and duration <= 1.8:
            return {
                "detected": True,
                "type": "CROSSFADE",
                "confidence": 0.88,
                "reason": "Gradual blended dissolve / crossfade pattern"
            }

        # 4. Pure solid / blank screen transition (near zero variance across all frames)
        if avg_edge < 5.0 and avg_hist_diff < 0.05 and (avg_lum < 25.0 or avg_lum > 230.0):
            return {
                "detected": True,
                "type": "BLANK_SCREEN",
                "confidence": 0.98,
                "reason": f"Blank screen transition (lum: {avg_lum:.1f}, edge: {avg_edge:.1f})"
            }

        return {
            "detected": False,
            "type": "NONE",
            "confidence": 0.0,
            "reason": "No transition detected"
        }

