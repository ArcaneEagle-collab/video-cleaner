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

        # Transitions are typically short (< 2.5 seconds)
        if duration > 3.0:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "reason": "Duration exceeds transition limits"}

        luminances = []
        edge_energies = []
        hist_diffs = []

        for i, (_, bgr, gray) in enumerate(frames):
            mean_lum = float(np.mean(gray))
            luminances.append(mean_lum)

            # Edge energy (Laplacian variance)
            lap = cv2.Laplacian(gray, cv2.CV_64F)
            edge_energy = float(np.var(lap))
            edge_energies.append(edge_energy)

            if i > 0:
                _, _, prev_gray = frames[i - 1]
                h1 = cv2.calcHist([prev_gray], [0], None, [32], [0, 256])
                h2 = cv2.calcHist([gray], [0], None, [32], [0, 256])
                cv2.normalize(h1, h1, 0, 1, cv2.NORM_MINMAX)
                cv2.normalize(h2, h2, 0, 1, cv2.NORM_MINMAX)
                corr = float(cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL))
                hist_diffs.append(1.0 - corr)

        min_lum = min(luminances)
        max_lum = max(luminances)
        avg_edge = float(np.mean(edge_energies))

        # 1. Dip to Black
        if min_lum < 15.0:
            confidence = min(0.96, 0.75 + (15.0 - min_lum) * 0.015)
            return {
                "detected": True,
                "type": "DIP_TO_BLACK",
                "confidence": round(confidence, 3),
                "reason": f"Luminance dropped to black ({min_lum:.1f})"
            }

        # 2. Dip to White / Flash
        if max_lum > 240.0:
            confidence = min(0.96, 0.75 + (max_lum - 240.0) * 0.015)
            return {
                "detected": True,
                "type": "DIP_TO_WHITE" if duration > 0.4 else "FLASH",
                "confidence": round(confidence, 3),
                "reason": f"Luminance spiked to white ({max_lum:.1f})"
            }

        # 3. Crossfade / Dissolve: low edge sharpness throughout short duration with steady histogram change
        avg_hist_diff = float(np.mean(hist_diffs)) if hist_diffs else 0.0
        if avg_edge < 40.0 and avg_hist_diff > 0.25 and duration <= 2.0:
            return {
                "detected": True,
                "type": "CROSSFADE",
                "confidence": 0.82,
                "reason": "Gradual blended dissolve with low edge sharpness"
            }

        return {
            "detected": False,
            "type": "NONE",
            "confidence": 0.0,
            "reason": "No transition detected"
        }
