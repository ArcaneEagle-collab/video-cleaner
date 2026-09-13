import cv2
import numpy as np
from typing import List, Tuple, Dict, Any

class MotionDetector:
    """
    Computes comprehensive motion metrics over time using optical flow,
    spatial grid decomposition, and edge variance.
    Distinguishes natural organic motion (parallax, local deformations, talking heads)
    from rigid or non-existent slideshow motion.
    """
    def __init__(self, grid_rows: int = 4, grid_cols: int = 4):
        self.grid_rows = grid_rows
        self.grid_cols = grid_cols

    def analyze_frames(self, frames: List[Tuple[float, np.ndarray, np.ndarray]]) -> Dict[str, Any]:
        """
        Analyzes consecutive frames and returns motion metrics.
        """
        if len(frames) < 2:
            return {
                "motion_score": 0.0,
                "global_motion_score": 0.0,
                "local_motion_score": 0.0,
                "frame_similarity": 1.0,
                "edge_change": 0.0,
                "scene_complexity": 50.0,
                "is_organic_motion": False
            }

        magnitudes = []
        global_motions = []
        local_motion_variances = []
        edge_changes = []
        complexities = []
        similarities = []

        for i in range(len(frames) - 1):
            try:
                _, _, gray1 = frames[i]
                _, _, gray2 = frames[i + 1]

                if gray1 is None or gray2 is None or gray1.size == 0 or gray2.size == 0:
                    continue
                if gray1.shape != gray2.shape:
                    continue

                # Scene complexity (Laplacian variance)
                lap = cv2.Laplacian(gray1, cv2.CV_64F)
                complexities.append(float(np.var(lap)))

                # Optical flow
                flow = cv2.calcOpticalFlowFarneback(
                    gray1, gray2, None,
                    pyr_scale=0.5, levels=3, winsize=15,
                    iterations=3, poly_n=5, poly_sigma=1.2, flags=0
                )
                u = flow[..., 0]
                v = flow[..., 1]
                mag = np.hypot(u, v)
                avg_mag = float(np.mean(mag))
                magnitudes.append(avg_mag)

                # Global motion: magnitude of the average flow vector
                mean_u = float(np.mean(u))
                mean_v = float(np.mean(v))
                global_motion = float(np.hypot(mean_u, mean_v))
                global_motions.append(global_motion)

                # Local motion: split into spatial grid blocks and calculate variance across cells
                h, w = gray1.shape
                cell_h = max(1, h // self.grid_rows)
                cell_w = max(1, w // self.grid_cols)
                cell_mags = []

                for r in range(self.grid_rows):
                    for c in range(self.grid_cols):
                        cell = mag[r * cell_h:(r + 1) * cell_h, c * cell_w:(c + 1) * cell_w]
                        if cell.size > 0:
                            cell_mags.append(float(np.mean(cell)))

                # Variance among grid blocks: high variance indicates local localized motion (e.g. mouth/head moving, animal walking)
                local_var = float(np.std(cell_mags)) if cell_mags else 0.0
                local_motion_variances.append(local_var)

                # Edge change: difference in Sobel edge maps
                sobel1 = cv2.Sobel(gray1, cv2.CV_64F, 1, 1, ksize=3)
                sobel2 = cv2.Sobel(gray2, cv2.CV_64F, 1, 1, ksize=3)
                edge_diff = float(np.mean(np.abs(sobel1 - sobel2)))
                edge_changes.append(edge_diff)

                # Frame similarity (normalized cross-correlation without zero-variance warning)
                std1 = float(np.std(gray1))
                std2 = float(np.std(gray2))
                if std1 < 1e-4 or std2 < 1e-4:
                    norm_sim = 1.0 if float(np.mean(cv2.absdiff(gray1, gray2))) < 1.0 else 0.0
                else:
                    corr_matrix = np.corrcoef(gray1.ravel(), gray2.ravel())
                    norm_sim = float(corr_matrix[0, 1]) if not np.isnan(corr_matrix[0, 1]) else 1.0
                similarities.append(norm_sim)
            except Exception:
                continue

        if not magnitudes:
            return {
                "motion_score": 0.0,
                "global_motion_score": 0.0,
                "local_motion_score": 0.0,
                "frame_similarity": 1.0,
                "edge_change": 0.0,
                "scene_complexity": 50.0,
                "is_organic_motion": False
            }

        avg_motion = float(np.mean(magnitudes))
        avg_global = float(np.mean(global_motions)) if global_motions else 0.0
        avg_local = float(np.mean(local_motion_variances)) if local_motion_variances else 0.0
        avg_edge_change = float(np.mean(edge_changes)) if edge_changes else 0.0
        avg_complexity = float(np.mean(complexities)) if complexities else 50.0
        avg_similarity = float(np.mean(similarities)) if similarities else 1.0

        # Determine organic real motion:
        # If there's local motion variance (talking head, people moving, waves, tree rustle)
        # or non-uniform camera movement with complexity
        is_organic = (avg_local > 0.4 and avg_motion > 0.3) or (avg_edge_change > 4.0 and avg_similarity < 0.96)

        return {
            "motion_score": round(avg_motion, 3),
            "global_motion_score": round(avg_global, 3),
            "local_motion_score": round(avg_local, 3),
            "frame_similarity": round(avg_similarity, 4),
            "edge_change": round(avg_edge_change, 2),
            "scene_complexity": round(avg_complexity, 1),
            "is_organic_motion": is_organic
        }
