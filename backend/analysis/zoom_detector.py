import cv2
import numpy as np
from typing import List, Tuple, Dict, Any

class ZoomPanDetector:
    """
    Detects artificial Ken Burns zoom-in, zoom-out, pan, and slide effects on still images.
    Distinguishes them from natural camera motion by analyzing global vs local motion consistency,
    affine fit residual error (3D parallax produces high residual, planar still images produce near-zero residual),
    and flow divergence.
    """
    def __init__(self):
        pass

    def analyze_fine_pairs(self, pairs: List[Tuple[float, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]) -> Dict[str, Any]:
        """
        Analyzes frame pairs (t, f1_bgr, f1_gray, f2_bgr, f2_gray) separated by short dt (~0.1s).
        This guarantees optical flow vectors remain within Farneback's optimal search radius.
        """
        if not pairs:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "residual_error": 5.0}

        scale_changes = []
        divergences = []
        residuals = []
        inliers_list = []
        pan_mags = []

        for _, _, gray1, _, gray2 in pairs:
            try:
                if gray1 is None or gray2 is None or gray1.size == 0 or gray2.size == 0:
                    continue
                if gray1.shape != gray2.shape:
                    continue

                flow = cv2.calcOpticalFlowFarneback(
                    gray1, gray2, None,
                    pyr_scale=0.5, levels=3, winsize=15,
                    iterations=3, poly_n=5, poly_sigma=1.2, flags=0
                )

                u = flow[..., 0]
                v = flow[..., 1]
                mag = np.hypot(u, v)

                mean_mag = float(np.mean(mag))
                if mean_mag < 0.04 or not np.isfinite(mean_mag):
                    continue

                h, w = gray1.shape
                y_coords, x_coords = np.mgrid[0:h:8, 0:w:8]
                pts1 = np.vstack((x_coords.ravel(), y_coords.ravel())).T.astype(np.float32)
                sampled_u = u[::8, ::8].ravel()
                sampled_v = v[::8, ::8].ravel()

                if not (np.all(np.isfinite(sampled_u)) and np.all(np.isfinite(sampled_v))):
                    continue

                pts2 = pts1 + np.vstack((sampled_u, sampled_v)).T.astype(np.float32)
                if len(pts1) < 6 or len(pts2) < 6:
                    continue

                affine_matrix, inliers = cv2.estimateAffinePartial2D(
                    pts1, pts2, method=cv2.RANSAC, ransacReprojThreshold=1.2
                )

                if affine_matrix is not None and inliers is not None and len(inliers) > 0:
                    a, b = affine_matrix[0, 0], affine_matrix[0, 1]
                    scale = float(np.sqrt(a * a + b * b))
                    if not np.isfinite(scale):
                        continue
                    scale_changes.append(scale)

                    tx, ty = float(affine_matrix[0, 2]), float(affine_matrix[1, 2])
                    pan_mags.append(float(np.hypot(tx, ty)))

                    pred_pts2 = cv2.transform(pts1.reshape(-1, 1, 2), affine_matrix).reshape(-1, 2)
                    err = np.linalg.norm(pts2 - pred_pts2, axis=1)
                    residuals.append(float(np.mean(err)))
                    inliers_list.append(float(np.mean(inliers)))

                    # Radial dot product
                    y_grid, x_grid = np.indices((h, w))
                    rx = x_grid - (w / 2.0)
                    ry = y_grid - (h / 2.0)
                    radial_dot = (u * rx + v * ry)
                    divergences.append(float(np.mean(radial_dot > 0)))
            except Exception:
                continue

        if not scale_changes:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "residual_error": 5.0}

        avg_scale = float(np.mean(scale_changes))
        avg_residual = float(np.mean(residuals)) if residuals else 5.0
        avg_inliers = float(np.mean(inliers_list)) if inliers_list else 0.0
        avg_radial = float(np.mean(divergences)) if divergences else 0.5
        avg_pan = float(np.mean(pan_mags)) if pan_mags else 0.0

        detected = False
        detected_type = "NONE"
        confidence = 0.0

        # Planar Ken Burns criteria on fine pairs:
        # Inliers > 88% and residual < 0.85 px
        if avg_inliers > 0.88 and avg_residual < 0.85:
            detected = True
            confidence = min(0.98, 0.70 + (avg_inliers - 0.85) * 1.5 + (0.85 - avg_residual) * 0.2)
            if avg_radial > 0.58:
                detected_type = "IMAGE_ZOOM_IN"
            elif avg_radial < 0.42:
                detected_type = "IMAGE_ZOOM_OUT"
            elif avg_pan > 0.3:
                detected_type = "IMAGE_PAN"
            else:
                detected_type = "IMAGE_ZOOM"

        return {
            "detected": detected,
            "type": detected_type,
            "confidence": round(confidence, 3),
            "scale_change": round(avg_scale, 4),
            "divergence": round(avg_radial, 3),
            "residual_error": round(avg_residual, 3),
            "inliers": round(avg_inliers, 3)
        }

    def analyze_frames(self, frames: List[Tuple[float, np.ndarray, np.ndarray]]) -> Dict[str, Any]:
        """
        Analyzes consecutive frames (t, bgr, gray) for Ken Burns zoom, pan, and slide effects.
        Fallback when fine-pair sampling is unavailable or has insufficient pairs.
        """
        if not frames or len(frames) < 2:
            return {
                "detected": False,
                "type": "NONE",
                "confidence": 0.0,
                "scale_change": 1.0,
                "divergence": 0.5,
                "residual_error": 5.0,
                "flow_uniformity": 0.0
            }

        scale_changes = []
        divergences = []
        residuals = []
        flow_uniformities = []
        pan_vectors = []

        for i in range(len(frames) - 1):
            try:
                _, _, gray1 = frames[i]
                _, _, gray2 = frames[i + 1]

                if gray1 is None or gray2 is None or gray1.size == 0 or gray2.size == 0:
                    continue
                if gray1.shape != gray2.shape:
                    continue

                # Calculate dense optical flow (Farneback)
                flow = cv2.calcOpticalFlowFarneback(
                    gray1, gray2, None,
                    pyr_scale=0.5, levels=3, winsize=15,
                    iterations=3, poly_n=5, poly_sigma=1.2, flags=0
                )

                u = flow[..., 0]
                v = flow[..., 1]
                mag, ang = cv2.cartToPolar(u, v)

                mean_mag = float(np.mean(mag))
                if mean_mag < 0.05 or not np.isfinite(mean_mag):
                    continue

                h, w = gray1.shape
                y_coords, x_coords = np.mgrid[0:h:8, 0:w:8]
                pts1 = np.vstack((x_coords.ravel(), y_coords.ravel())).T.astype(np.float32)
                sampled_u = u[::8, ::8].ravel()
                sampled_v = v[::8, ::8].ravel()

                if not (np.all(np.isfinite(sampled_u)) and np.all(np.isfinite(sampled_v))):
                    continue

                pts2 = pts1 + np.vstack((sampled_u, sampled_v)).T.astype(np.float32)
                if len(pts1) < 6 or len(pts2) < 6:
                    continue

                # Estimate partial affine (scale, rotation, translation - 4 DOF)
                affine_matrix, inliers = cv2.estimateAffinePartial2D(
                    pts1, pts2, method=cv2.RANSAC, ransacReprojThreshold=1.5
                )

                if affine_matrix is not None and inliers is not None and len(inliers) > 0:
                    a, b = affine_matrix[0, 0], affine_matrix[0, 1]
                    scale = float(np.sqrt(a * a + b * b))
                    if not np.isfinite(scale):
                        continue
                    scale_changes.append(scale)

                    tx, ty = float(affine_matrix[0, 2]), float(affine_matrix[1, 2])
                    pan_vectors.append((tx, ty))

                    pred_pts2 = cv2.transform(pts1.reshape(-1, 1, 2), affine_matrix).reshape(-1, 2)
                    err = np.linalg.norm(pts2 - pred_pts2, axis=1)
                    mean_err = float(np.mean(err))
                    residuals.append(mean_err)

                    angle_std = float(np.std(ang[::8, ::8]))
                    flow_uniformities.append(angle_std)

                    y_grid, x_grid = np.indices((h, w))
                    rx = x_grid - (w / 2.0)
                    ry = y_grid - (h / 2.0)
                    radial_dot = (u * rx + v * ry)
                    pos_radial_ratio = float(np.mean(radial_dot > 0))
                    divergences.append(pos_radial_ratio)
            except Exception:
                continue

        if not scale_changes:
            return {
                "detected": False,
                "type": "NONE",
                "confidence": 0.0,
                "scale_change": 1.0,
                "divergence": 0.5,
                "residual_error": 5.0,
                "flow_uniformity": 0.0
            }

        avg_scale = float(np.mean(scale_changes))
        avg_residual = float(np.mean(residuals)) if residuals else 5.0
        avg_pos_radial = float(np.mean(divergences)) if divergences else 0.5
        avg_uniformity = float(np.mean(flow_uniformities)) if flow_uniformities else 2.0

        scale_diff = abs(avg_scale - 1.0)
        pan_mags = [np.hypot(tx, ty) for tx, ty in pan_vectors]
        avg_pan_mag = float(np.mean(pan_mags)) if pan_mags else 0.0

        detected = False
        detected_type = "NONE"
        confidence = 0.0

        # Planar Ken Burns detection criteria:
        # 1. Low residual error (< 0.8 px) showing planar 2D motion without 3D parallax
        # 2. Radial outward or inward flow (zoom) or uniform directional translation (pan)
        if avg_residual < 0.85:
            if avg_pos_radial > 0.65 or (scale_diff > 0.0002 and avg_pos_radial > 0.60):
                # Zoom In (outward radiation)
                detected = True
                confidence = min(0.96, 0.70 + (avg_pos_radial - 0.60) * 1.5 + (0.85 - avg_residual) * 0.2)
                detected_type = "IMAGE_ZOOM_IN"
            elif avg_pos_radial < 0.35:
                # Zoom Out (inward radiation)
                detected = True
                confidence = min(0.96, 0.70 + (0.40 - avg_pos_radial) * 1.5 + (0.85 - avg_residual) * 0.2)
                detected_type = "IMAGE_ZOOM_OUT"
            elif avg_pan_mag > 0.5 and avg_uniformity < 0.85:
                # Uniform linear pan / slide
                detected = True
                confidence = min(0.95, 0.65 + (avg_pan_mag * 0.1) + (0.85 - avg_residual) * 0.2)
                detected_type = "IMAGE_PAN" if avg_pan_mag < 4.0 else "IMAGE_SLIDE"
        elif avg_residual < 1.5 and (avg_pos_radial > 0.72 or avg_pos_radial < 0.28):
            detected = True
            confidence = 0.65
            detected_type = "IMAGE_ZOOM_IN" if avg_pos_radial > 0.5 else "IMAGE_ZOOM_OUT"

        return {
            "detected": detected,
            "type": detected_type,
            "confidence": round(confidence, 3),
            "scale_change": round(avg_scale, 4),
            "divergence": round(avg_pos_radial, 3),
            "residual_error": round(avg_residual, 3),
            "flow_uniformity": round(avg_uniformity, 3)
        }
