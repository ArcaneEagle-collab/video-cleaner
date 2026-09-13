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
            flow = cv2.calcOpticalFlowFarneback(
                gray1, gray2, None,
                pyr_scale=0.5, levels=3, winsize=15,
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0
            )

            u = flow[..., 0]
            v = flow[..., 1]
            mag = np.hypot(u, v)

            mean_mag = float(np.mean(mag))
            if mean_mag < 0.04:
                continue

            h, w = gray1.shape
            y_coords, x_coords = np.mgrid[0:h:8, 0:w:8]
            pts1 = np.vstack((x_coords.ravel(), y_coords.ravel())).T.astype(np.float32)
            sampled_u = u[::8, ::8].ravel()
            sampled_v = v[::8, ::8].ravel()
            pts2 = pts1 + np.vstack((sampled_u, sampled_v)).T.astype(np.float32)

            affine_matrix, inliers = cv2.estimateAffinePartial2D(
                pts1, pts2, method=cv2.RANSAC, ransacReprojThreshold=1.2
            )

            if affine_matrix is not None and inliers is not None:
                a, b = affine_matrix[0, 0], affine_matrix[0, 1]
                scale = float(np.sqrt(a * a + b * b))
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

        if not scale_changes:
            return {"detected": False, "type": "NONE", "confidence": 0.0, "residual_error": 5.0}

        avg_scale = float(np.mean(scale_changes))
        avg_residual = float(np.mean(residuals))
        avg_inliers = float(np.mean(inliers_list))
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

        scale_changes = []
        divergences = []
        residuals = []
        flow_uniformities = []
        pan_vectors = []

        for i in range(len(frames) - 1):
            _, _, gray1 = frames[i]
            _, _, gray2 = frames[i + 1]

            # Calculate dense optical flow (Farneback)
            # Parameters tuned for fast, smooth global motion estimation
            flow = cv2.calcOpticalFlowFarneback(
                gray1, gray2, None,
                pyr_scale=0.5, levels=3, winsize=15,
                iterations=3, poly_n=5, poly_sigma=1.2, flags=0
            )

            u = flow[..., 0]
            v = flow[..., 1]
            mag, ang = cv2.cartToPolar(u, v)

            mean_mag = float(np.mean(mag))
            # If there's virtually no motion at all (< 0.05 px), this is static, not zoom/pan
            if mean_mag < 0.05:
                continue

            h, w = gray1.shape
            y_coords, x_coords = np.mgrid[0:h:8, 0:w:8]
            pts1 = np.vstack((x_coords.ravel(), y_coords.ravel())).T.astype(np.float32)
            sampled_u = u[::8, ::8].ravel()
            sampled_v = v[::8, ::8].ravel()
            pts2 = pts1 + np.vstack((sampled_u, sampled_v)).T.astype(np.float32)

            # Estimate partial affine (scale, rotation, translation - 4 DOF)
            affine_matrix, inliers = cv2.estimateAffinePartial2D(
                pts1, pts2, method=cv2.RANSAC, ransacReprojThreshold=1.5
            )

            if affine_matrix is not None:
                # Extract scale factor: sqrt(det(A))
                a, b = affine_matrix[0, 0], affine_matrix[0, 1]
                scale = float(np.sqrt(a * a + b * b))
                scale_changes.append(scale)

                tx, ty = float(affine_matrix[0, 2]), float(affine_matrix[1, 2])
                pan_vectors.append((tx, ty))

                # Compute residual error: how well the 2D affine model explains the entire flow field
                # In synthetic zoom/pan of a still photo: residual is tiny (< 0.6 px) and inlier ratio is > 90%
                # In real camera video: 3D parallax and independent motion create high residual (> 1.5 px)
                pred_pts2 = cv2.transform(pts1.reshape(-1, 1, 2), affine_matrix).reshape(-1, 2)
                err = np.linalg.norm(pts2 - pred_pts2, axis=1)
                mean_err = float(np.mean(err))
                residuals.append(mean_err)

                # Compute flow uniformity (angle consistency for panning)
                # If all vectors point in the same direction, std of angle is low
                angle_std = float(np.std(ang[::8, ::8]))
                flow_uniformities.append(angle_std)

                # 4. Optical flow divergence and radial dot product
                # In Ken Burns zoom-in, flow radiates outward from center: (u*rx + v*ry) > 0
                # In Ken Burns zoom-out, flow radiates inward toward center: (u*rx + v*ry) < 0
                # In Ken Burns pan/slide, flow is highly unidirectional across entire frame
                y_grid, x_grid = np.indices((h, w))
                rx = x_grid - (w / 2.0)
                ry = y_grid - (h / 2.0)
                radial_dot = (u * rx + v * ry)
                pos_radial_ratio = float(np.mean(radial_dot > 0))
                divergences.append(pos_radial_ratio)

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
