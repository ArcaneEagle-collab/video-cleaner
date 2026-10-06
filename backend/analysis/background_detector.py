import cv2
import numpy as np
from typing import List, Tuple, Dict, Any

class ImageWithBackgroundDetector:
    """
    Advanced multi-signal detector for still images and editorial photos placed over backgrounds:
    1. Windowed / Patterned Canvas / White Margins (e.g. Photo centered inside patterned canvas or white border)
    2. Framed Photo Card / Polaroid / Tilted Picture (e.g. Photo card with white border + news banner / overlay)
    3. Top Still / Ken Burns Photo with Animated Bottom Banner / Ticker
    4. Split-Screen Editorial Photos (vertical center dividing line)
    5. Inset Photo Card over Moving Video Backdrop
    6. Blurred Duplicate Background ('Blurred Wings' / Bokeh Pillarbox)
    7. Solid Letterbox / Pillarbox Bars with Still Photo
    8. Cutout on Plain or Uniform Backdrop
    """
    def __init__(self, margin_ratio: float = 0.08):
        self.margin_ratio = margin_ratio

    def analyze_fine_pairs(self, pairs: List[Tuple]) -> Dict[str, Any]:
        """
        Analyzes frame pairs (t, f1_bgr, f1_gray, f2_bgr, f2_gray[, flow]) separated by short dt (~0.12s)
        for editorial photos placed over backgrounds, canvas frames, or news tickers.
        Accepts both 5-element pairs and 6-element enriched pairs with precomputed optical flow.
        """
        if not pairs:
            return {"detected": False, "confidence": 0.0, "type": "NONE", "bg_type": "NONE", "reason": ""}

        pair_stats = []

        for pair in pairs:
            f1_bgr = pair[1]
            g1 = pair[2]
            g2 = pair[4]
            # Reuse precomputed flow from enriched 6-element pairs if available
            precomputed_flow = pair[5] if len(pair) >= 6 else None

            if f1_bgr is None or g1 is None or g2 is None or g1.size == 0 or g2.size == 0:
                continue
            if g1.shape != g2.shape:
                continue

            try:
                h, w = g1.shape
                diff = cv2.absdiff(g1, g2)
                if precomputed_flow is not None:
                    flow = precomputed_flow
                else:
                    flow = cv2.calcOpticalFlowFarneback(g1, g2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
                u, v = flow[..., 0], flow[..., 1]
                mag = np.hypot(u, v)

                # -------------------------------------------------------------
                # 1. Margins Analysis (Outer 8% on all 4 sides)
                # -------------------------------------------------------------
                m_h = max(1, int(h * self.margin_ratio))
                m_w = max(1, int(w * self.margin_ratio))

                top_strip = f1_bgr[:m_h, :]
                bot_strip = f1_bgr[-m_h:, :]
                left_strip = f1_bgr[:, :m_w]
                right_strip = f1_bgr[:, -m_w:]

                top_b = float(np.mean(top_strip))
                bot_b = float(np.mean(bot_strip))
                left_b = float(np.mean(left_strip))
                right_b = float(np.mean(right_strip))

                tb_var = float((np.mean(np.var(top_strip, axis=(0, 1))) + np.mean(np.var(bot_strip, axis=(0, 1)))) / 2.0)
                lr_var = float((np.mean(np.var(left_strip, axis=(0, 1))) + np.mean(np.var(right_strip, axis=(0, 1)))) / 2.0)

                top_d = float(np.mean(diff[:m_h, :]))
                bot_d = float(np.mean(diff[-m_h:, :]))
                left_d = float(np.mean(diff[:, :m_w]))
                right_d = float(np.mean(diff[:, -m_w:]))
                margin_diff = (top_d + bot_d + left_d + right_d) / 4.0

                # -------------------------------------------------------------
                # 2. White Card / Polaroid / Canvas Borders (HSV Brightness & Sat)
                # -------------------------------------------------------------
                hsv = cv2.cvtColor(f1_bgr, cv2.COLOR_BGR2HSV)
                white_mask = (hsv[..., 1] < 40) & (hsv[..., 2] > 210)
                white_ratio = float(np.mean(white_mask))

                # Saturated News Ribbon / Banner in Lower 40%
                bot_hsv = hsv[int(h * 0.60):, :]
                blue_mask = (bot_hsv[..., 0] >= 100) & (bot_hsv[..., 0] <= 130) & (bot_hsv[..., 1] > 115) & (bot_hsv[..., 2] > 70)
                blue_ratio = float(np.mean(blue_mask))

                # Straight Border Lines for Card Frames (Hough Transform)
                edges = cv2.Canny(g1, 50, 150)
                lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=70, minLineLength=int(min(h, w) * 0.22), maxLineGap=10)
                perpendicular_corners = 0
                if lines is not None and len(lines) >= 2:
                    angles = []
                    for l in lines:
                        pts = l[0] if len(l.shape) > 1 else l
                        angles.append(np.degrees(np.arctan2(pts[3] - pts[1], pts[2] - pts[0])) % 180)
                    for a1 in angles:
                        for a2 in angles:
                            diff_a = abs(a1 - a2)
                            if 82 < diff_a < 98:
                                perpendicular_corners += 1

                # -------------------------------------------------------------
                # 3. Top 70% vs Bottom 30% Motion Disparity
                # -------------------------------------------------------------
                top_h = int(h * 0.70)
                top_m = mag[:top_h, :]
                bot_m = mag[top_h:, :]

                top_zero = float(np.mean(top_m < 0.25))
                top_mag = float(np.mean(top_m))
                bot_mag = float(np.mean(bot_m))

                # Affine RANSAC on Top 70%
                y_x_top = np.mgrid[0:top_h:8, 0:w:8]
                p1_top = np.vstack((y_x_top[1].ravel(), y_x_top[0].ravel())).T.astype(np.float32)
                su_top = u[:top_h:8, ::8].ravel()
                sv_top = v[:top_h:8, ::8].ravel()
                p2_top = p1_top + np.vstack((su_top, sv_top)).T.astype(np.float32)

                top_M, top_inl = cv2.estimateAffinePartial2D(p1_top, p2_top, method=cv2.RANSAC, ransacReprojThreshold=1.2)
                top_res = 99.0
                top_inl_ratio = 0.0
                if top_M is not None and top_inl is not None:
                    pred_top = cv2.transform(p1_top.reshape(-1, 1, 2), top_M).reshape(-1, 2)
                    top_res = float(np.linalg.norm(p2_top - pred_top, axis=1).mean())
                    top_inl_ratio = float(top_inl.mean())

                # -------------------------------------------------------------
                # 4. Center Inset Box (Inner 65% x 65%)
                # -------------------------------------------------------------
                cen_y1, cen_y2 = int(h * 0.18), int(h * 0.82)
                cen_x1, cen_x2 = int(w * 0.18), int(w * 0.82)
                cen_m = mag[cen_y1:cen_y2, cen_x1:cen_x2]
                cen_zero = float(np.mean(cen_m < 0.25))
                cen_mag = float(np.mean(cen_m))

                border_mask = np.ones((h, w), dtype=bool)
                border_mask[cen_y1:cen_y2, cen_x1:cen_x2] = False
                bdr_mag = float(np.mean(mag[border_mask]))

                # Affine RANSAC on Center Box
                y_x = np.mgrid[0:h:8, 0:w:8]
                p1 = np.vstack((y_x[1].ravel(), y_x[0].ravel())).T.astype(np.float32)
                su = u[::8, ::8].ravel()
                sv = v[::8, ::8].ravel()
                p2 = p1 + np.vstack((su, sv)).T.astype(np.float32)

                cen_pts_mask = (p1[:, 1] >= cen_y1) & (p1[:, 1] < cen_y2) & (p1[:, 0] >= cen_x1) & (p1[:, 0] < cen_x2)
                cen_p1 = p1[cen_pts_mask]
                cen_p2 = p2[cen_pts_mask]
                cen_M, cen_inl = cv2.estimateAffinePartial2D(cen_p1, cen_p2, method=cv2.RANSAC, ransacReprojThreshold=1.2)
                cen_res = 99.0
                cen_inl_ratio = 0.0
                if cen_M is not None and cen_inl is not None:
                    pred_cen = cv2.transform(cen_p1.reshape(-1, 1, 2), cen_M).reshape(-1, 2)
                    cen_res = float(np.linalg.norm(cen_p2 - pred_cen, axis=1).mean())
                    cen_inl_ratio = float(cen_inl.mean())

                # -------------------------------------------------------------
                # 5. Split-screen / Center Dividing Line Check
                # -------------------------------------------------------------
                sobel_x = np.abs(cv2.Sobel(g1, cv2.CV_64F, 1, 0, ksize=3))
                col_profile = np.mean(sobel_x, axis=0)
                center_col_band = col_profile[int(w * 0.46):int(w * 0.54)]
                mid_split_peak = float(np.max(center_col_band)) / max(1.0, float(np.mean(col_profile)))

                center_slice = sobel_x[:, int(w * 0.46):int(w * 0.54)]
                col_sums = np.sum(center_slice, axis=0)
                best_col_idx = np.argmax(col_sums)
                best_col = center_slice[:, best_col_idx]
                split_continuity = float(np.mean(best_col > 35.0))

                left_half_zero = float(np.mean(mag[:, :w // 2] < 0.25))
                right_half_zero = float(np.mean(mag[:, w // 2:] < 0.25))
                left_half_mag = float(np.mean(mag[:, :w // 2]))
                right_half_mag = float(np.mean(mag[:, w // 2:]))

                # -------------------------------------------------------------
                # 6. Blurred Duplicate Background (Wings / Bokeh Pillarbox)
                # -------------------------------------------------------------
                left_w = int(w * 0.20)
                right_w = int(w * 0.80)
                cen_lap = float(cv2.Laplacian(g1[:, left_w:right_w], cv2.CV_64F).var())
                wings_lap = float((cv2.Laplacian(g1[:, :left_w], cv2.CV_64F).var() + cv2.Laplacian(g1[:, right_w:], cv2.CV_64F).var()) / 2.0)
                wings_color_var = float((np.mean(np.var(f1_bgr[:, :left_w], axis=(0, 1))) + np.mean(np.var(f1_bgr[:, right_w:], axis=(0, 1)))) / 2.0)

            except Exception:
                continue

            pair_stats.append({
                "top_b": top_b, "bot_b": bot_b, "left_b": left_b, "right_b": right_b,
                "tb_var": tb_var, "lr_var": lr_var, "margin_diff": margin_diff, "top_d": top_d,
                "white_ratio": white_ratio, "blue_ratio": blue_ratio,
                "perpendicular_corners": perpendicular_corners,
                "top_zero": top_zero, "top_mag": top_mag, "bot_mag": bot_mag,
                "top_inl": top_inl_ratio, "top_res": top_res,
                "cen_zero": cen_zero, "cen_mag": cen_mag, "bdr_mag": bdr_mag,
                "cen_inl": cen_inl_ratio, "cen_res": cen_res,
                "mid_split_peak": mid_split_peak, "split_continuity": split_continuity,
                "left_half_zero": left_half_zero, "right_half_zero": right_half_zero,
                "left_half_mag": left_half_mag, "right_half_mag": right_half_mag,
                "cen_lap": cen_lap, "wings_lap": wings_lap, "wings_color_var": wings_color_var
            })

        if not pair_stats:
            return {"detected": False, "confidence": 0.0, "type": "NONE", "bg_type": "NONE", "reason": ""}

        avg = {k: float(np.mean([p[k] for p in pair_stats])) for k in pair_stats[0]}

        detected = False
        confidence = 0.0
        bg_subtype = "NONE"
        reason = ""

        # Check 1: Windowed / Patterned Canvas / White Margin Borders (Matches Screenshot 2)
        if ((avg["top_b"] > 195 and avg["bot_b"] > 195 and avg["margin_diff"] < 1.2) or 
            (avg["left_b"] > 195 and avg["right_b"] > 195 and avg["margin_diff"] < 1.2)) and avg["margin_diff"] < 1.5:
            detected = True
            confidence = 0.96
            bg_subtype = "WINDOWED_CANVAS_PHOTO"
            reason = f"Still photo framed by patterned canvas / white margin borders (brightness: {avg['top_b']:.0f})"

        # Check 2: Framed Photo Card / Polaroid / Tilted Picture Card (Matches Screenshot 1)
        elif (avg["white_ratio"] > 0.05 and avg["blue_ratio"] > 0.05) or \
             (avg["white_ratio"] > 0.06 and avg["perpendicular_corners"] > 25 and avg["top_d"] < 0.9):
            detected = True
            confidence = 0.95
            bg_subtype = "FRAMED_PHOTO_CARD"
            reason = f"Framed photo card ({avg['white_ratio']*100:.1f}% border pixels) with news banner/overlay"

        # Check 3: Split-Screen Editorial Photos (vertical center dividing line with continuous edge)
        elif avg["mid_split_peak"] > 4.5 and avg["split_continuity"] > 0.18 and (
            (avg["left_half_zero"] > 0.40 and avg["right_half_zero"] > 0.40) or 
            (avg["left_half_mag"] < 0.50 and avg["right_half_mag"] < 0.50)
        ):
            detected = True
            confidence = 0.95
            bg_subtype = "SPLIT_SCREEN_PHOTOS"
            reason = f"Split-screen editorial still photos (center divider prominence: {avg['mid_split_peak']:.1f}x)"

        # Check 4: Top Photo with Bottom Animated Banner / Ticker
        elif (avg["bot_mag"] > (avg["top_mag"] * 1.6 + 0.3)) and (avg["top_zero"] > 0.45 or (avg["top_inl"] > 0.85 and avg["top_res"] < 0.65)) and avg["bot_mag"] > 0.45:
            detected = True
            confidence = 0.94
            bg_subtype = "STILL_PHOTO_WITH_BOTTOM_BANNER"
            if avg["top_inl"] > 0.85 and avg["top_res"] < 0.65:
                reason = f"Ken Burns photo in upper frame ({avg['top_inl']*100:.0f}% planar inliers) over animated banner/ticker"
            else:
                reason = f"Still photo in upper frame ({avg['top_zero']*100:.0f}% static) over animated banner/ticker"

        # Check 5: Photo Card Inset over Moving Backdrop
        # Requires true disparity: center is essentially motionless (cen_mag < 0.35 and cen_zero > 0.55)
        # with moving backdrop (bdr_mag > 0.55 and bdr_mag > cen_mag * 1.8), OR has card borders with significant speed disparity.
        elif (
            (avg["cen_mag"] < 0.35 and avg["cen_zero"] > 0.55 and avg["bdr_mag"] > 0.55 and (avg["bdr_mag"] - avg["cen_mag"] > 0.30))
        ) or (
            (avg["white_ratio"] > 0.08 or avg["cen_inl"] > 0.88) and
            (avg["bdr_mag"] - avg["cen_mag"] > 0.50) and
            avg["cen_res"] < 0.55 and avg["cen_mag"] < 0.35
        ):
            detected = True
            confidence = 0.93
            bg_subtype = "STATIC_INSET_PHOTO_CARD"
            reason = f"Photo card inset (core motion: {avg['cen_mag']:.2f}px) over moving backdrop"


        # Check 6: Blurred Duplicate Background (Wings / Bokeh Pillarbox)
        elif avg["wings_lap"] < 45.0 and avg["wings_color_var"] > 45.0 and avg["cen_lap"] > 90.0 and (avg["wings_lap"] / max(1.0, avg["cen_lap"]) < 0.32) and (avg["cen_zero"] > 0.35 or avg["cen_mag"] < 0.7):
            detected = True
            confidence = 0.92
            bg_subtype = "BLURRED_WINGS_PHOTO"
            reason = f"Photo framed by blurred duplicate background (wings blur: {avg['wings_lap']:.1f})"

        # Check 7: Solid Letterbox / Pillarbox Bars with Still Photo (requires frozen center with photo details)
        elif (avg["tb_var"] < 5.0 or avg["lr_var"] < 5.0) and avg["cen_lap"] > 25.0 and avg["cen_zero"] > 0.80 and avg["cen_mag"] < 0.15:
            detected = True
            confidence = 0.92
            bg_subtype = "LETTERBOX_STILL_PHOTO"
            reason = "Still photo framed by solid letterbox/pillarbox bars"

        # Check 8: Cutout on Flat/Plain Backdrop (requires frozen center)
        elif (avg["tb_var"] < 8.0 or avg["lr_var"] < 8.0) and avg["cen_lap"] > 40.0 and avg["cen_zero"] > 0.80 and avg["cen_mag"] < 0.15:
            detected = True
            confidence = 0.91
            bg_subtype = "PLAIN_BACKDROP_PHOTO"
            reason = "Still photo cutout placed on plain/uniform backdrop"

        return {
            "detected": detected,
            "confidence": round(confidence, 3),
            "type": bg_subtype,
            "bg_type": bg_subtype,
            "reason": reason,
            "top_zero_motion": round(avg["top_zero"], 3),
            "center_zero_motion": round(avg["cen_zero"], 3),
            "white_ratio": round(avg["white_ratio"], 3),
            "wings_lap": round(avg["wings_lap"], 1),
            "center_lap": round(avg["cen_lap"], 1),
            "margin_diff": round(avg["margin_diff"], 2)
        }

    def analyze_frames(self, frames: List[Tuple[float, np.ndarray, np.ndarray]]) -> Dict[str, Any]:
        """
        Backwards-compatible frame-based analysis.
        """
        if len(frames) < 2:
            return {"detected": False, "confidence": 0.0, "bg_type": "NONE", "type": "NONE", "reason": ""}

        pairs = []
        for i in range(len(frames) - 1):
            t1, bgr1, gray1 = frames[i]
            _, bgr2, gray2 = frames[i + 1]
            pairs.append((t1, bgr1, gray1, bgr2, gray2))

        return self.analyze_fine_pairs(pairs)

# Alias for backwards compatibility
SimpleBackgroundDetector = ImageWithBackgroundDetector
