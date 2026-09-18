import cv2
import numpy as np
from typing import List, Tuple, Dict, Any, Optional

def compute_dhash(image_gray: np.ndarray, hash_size: int = 8) -> int:
    """Computes difference hash (dHash) for fast perceptual image comparison."""
    resized = cv2.resize(image_gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
    diff = resized[:, 1:] > resized[:, :-1]
    return sum([2 ** i for (i, v) in enumerate(diff.flatten()) if v])

def hamming_distance(hash1: int, hash2: int) -> int:
    """Computes bitwise Hamming distance between two integer hashes."""
    return bin(hash1 ^ hash2).count('1')

def compute_ssim_approx(
    img1_gray: np.ndarray,
    img2_gray: np.ndarray,
    stats1: Optional[Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = None,
    stats2: Optional[Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = None
) -> Tuple[float, Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray], Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
    """
    Computes Structural Similarity Index (SSIM) approximation
    between two grayscale frames using float32 for maximum throughput.
    Returns (ssim_score, stats1, stats2).
    """
    C1 = np.float32((0.01 * 255) ** 2)
    C2 = np.float32((0.03 * 255) ** 2)

    if stats1 is not None:
        img1, mu1, mu1_sq, sigma1_sq = stats1
    else:
        img1 = img1_gray.astype(np.float32)
        mu1 = cv2.GaussianBlur(img1, (11, 11), 1.5)
        mu1_sq = mu1 ** 2
        sigma1_sq = cv2.GaussianBlur(img1 ** 2, (11, 11), 1.5) - mu1_sq
        stats1 = (img1, mu1, mu1_sq, sigma1_sq)

    if stats2 is not None:
        img2, mu2, mu2_sq, sigma2_sq = stats2
    else:
        img2 = img2_gray.astype(np.float32)
        mu2 = cv2.GaussianBlur(img2, (11, 11), 1.5)
        mu2_sq = mu2 ** 2
        sigma2_sq = cv2.GaussianBlur(img2 ** 2, (11, 11), 1.5) - mu2_sq
        stats2 = (img2, mu2, mu2_sq, sigma2_sq)

    mu1_mu2 = mu1 * mu2
    sigma12 = cv2.GaussianBlur(img1 * img2, (11, 11), 1.5) - mu1_mu2

    ssim_map = ((2.0 * mu1_mu2 + C1) * (2.0 * sigma12 + C2)) / ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))
    return float(np.clip(np.mean(ssim_map), 0.0, 1.0)), stats1, stats2

class StaticImageDetector:
    """
    Detects motionless still images while protecting low-motion real video
    (e.g., people standing still, static cameras with real sensor noise).
    """
    def __init__(self, ssim_threshold: float = 0.985, pixel_diff_threshold: float = 1.2):
        self.ssim_threshold = ssim_threshold
        self.pixel_diff_threshold = pixel_diff_threshold

    def analyze_frames(self, frames: List[Tuple[float, np.ndarray, np.ndarray]]) -> Dict[str, Any]:
        """
        Analyzes a sequence of (timestamp, bgr, gray) frames.
        Returns confidence, is_static, and detailed metrics.
        """
        if len(frames) < 2:
            return {
                "is_static": False,
                "confidence": 0.0,
                "avg_ssim": 0.0,
                "avg_pixel_diff": 100.0,
                "temporal_noise": 5.0,
                "hamming_dist": 20
            }

        ssim_scores = []
        pixel_diffs = []
        hist_corrs = []
        dhash_diffs = []
        noise_variances = []
        max_diffs = []

        prev_stats = None
        prev_dhash = None
        prev_hist = None

        for i in range(len(frames) - 1):
            try:
                _, bgr1, gray1 = frames[i]
                _, bgr2, gray2 = frames[i + 1]

                if gray1 is None or gray2 is None or gray1.size == 0 or gray2.size == 0:
                    prev_stats, prev_dhash, prev_hist = None, None, None
                    continue
                if gray1.shape != gray2.shape:
                    prev_stats, prev_dhash, prev_hist = None, None, None
                    continue

                # 1. SSIM (reusing Gaussian statistics of shared frame)
                ssim_val, _, next_stats = compute_ssim_approx(gray1, gray2, stats1=prev_stats)
                prev_stats = next_stats
                ssim_scores.append(ssim_val)

                # 2. Mean and max absolute pixel difference
                abs_diff = cv2.absdiff(gray1, gray2)
                mean_diff = float(np.mean(abs_diff))
                curr_max_diff = float(np.max(abs_diff))
                pixel_diffs.append(mean_diff)
                max_diffs.append(curr_max_diff)

                # 3. Temporal sensor noise in smooth regions
                flat_mask = abs_diff < 10
                if np.sum(flat_mask) > 100:
                    temporal_noise = float(np.std(abs_diff[flat_mask]))
                else:
                    temporal_noise = float(np.std(abs_diff))
                noise_variances.append(temporal_noise)

                # 4. dHash distance (cached)
                h1 = prev_dhash if prev_dhash is not None else compute_dhash(gray1)
                h2 = compute_dhash(gray2)
                prev_dhash = h2
                dhash_diffs.append(hamming_distance(h1, h2))

                # 5. Color histogram correlation (cached)
                if bgr1 is not None and bgr2 is not None and bgr1.shape == bgr2.shape:
                    h_bins, s_bins = 16, 16
                    hist1 = prev_hist if prev_hist is not None else cv2.calcHist([cv2.cvtColor(bgr1, cv2.COLOR_BGR2HSV)], [0, 1], None, [h_bins, s_bins], [0, 180, 0, 256])
                    if prev_hist is None:
                        cv2.normalize(hist1, hist1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

                    hist2 = cv2.calcHist([cv2.cvtColor(bgr2, cv2.COLOR_BGR2HSV)], [0, 1], None, [h_bins, s_bins], [0, 180, 0, 256])
                    cv2.normalize(hist2, hist2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
                    prev_hist = hist2

                    corr = float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL))
                    hist_corrs.append(corr)
                else:
                    prev_hist = None
                    hist_corrs.append(1.0)
            except Exception:
                continue

        if not ssim_scores:
            return {
                "is_static": False,
                "confidence": 0.0,
                "avg_ssim": 0.0,
                "avg_pixel_diff": 100.0,
                "max_pixel_diff": 0.0,
                "avg_hist_corr": 0.0,
                "avg_dhash_dist": 20.0,
                "temporal_noise": 5.0
            }

        avg_ssim = float(np.mean(ssim_scores))
        avg_pixel_diff = float(np.mean(pixel_diffs))
        avg_hist_corr = float(np.mean(hist_corrs)) if hist_corrs else 1.0
        avg_dhash_dist = float(np.mean(dhash_diffs)) if dhash_diffs else 20.0
        avg_noise = float(np.mean(noise_variances)) if noise_variances else 5.0
        max_diff = float(np.max(max_diffs)) if max_diffs else 0.0

        # Confidence calculation
        confidence = 0.0
        # If there's local localized motion (max diff > 25, like speaking mouth / blinking eyes), it's NOT a static photo
        has_local_movement = max_diff > 25.0

        if avg_ssim > 0.996 and avg_pixel_diff < 0.6 and avg_dhash_dist == 0 and not has_local_movement:
            confidence = 0.98
        elif avg_ssim > 0.990 and avg_pixel_diff < 1.0 and avg_dhash_dist <= 1:
            if avg_noise > 1.0 or has_local_movement:
                confidence = 0.25 # Protected: real footage / living subject
            else:
                confidence = 0.88
        elif avg_ssim > 0.97 and avg_pixel_diff < 2.0:
            if avg_noise > 0.8 or has_local_movement:
                confidence = 0.15 # Protected
            else:
                confidence = 0.70
        else:
            confidence = 0.10

        is_static = confidence >= 0.70

        return {
            "is_static": is_static,
            "confidence": round(confidence, 3),
            "avg_ssim": round(avg_ssim, 4),
            "avg_pixel_diff": round(avg_pixel_diff, 2),
            "max_pixel_diff": round(max_diff, 1),
            "avg_hist_corr": round(avg_hist_corr, 4),
            "avg_dhash_dist": round(avg_dhash_dist, 2),
            "temporal_noise": round(avg_noise, 3)
        }
