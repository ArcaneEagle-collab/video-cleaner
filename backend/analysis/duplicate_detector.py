import cv2
import numpy as np
from typing import List, Dict, Any, Tuple
from .static_detector import compute_dhash, hamming_distance

class DuplicateDetector:
    """
    Detects repeated still image sequences or slides across different scenes
    in the video using perceptual hashing.
    """
    def __init__(self, hamming_threshold: int = 2):
        self.hamming_threshold = hamming_threshold

    def find_duplicates(self, scene_representative_frames: List[Tuple[int, float, np.ndarray]]) -> Dict[int, Dict[str, Any]]:
        """
        Takes a list of (scene_index, timestamp, gray_frame)
        Returns mapping of scene_index -> duplicate metadata.
        """
        hashes = []
        for idx, t, frame in scene_representative_frames:
            h = compute_dhash(frame)
            hashes.append((idx, t, h))

        duplicates: Dict[int, Dict[str, Any]] = {}
        for i in range(len(hashes)):
            idx_i, t_i, h_i = hashes[i]
            for j in range(i + 1, len(hashes)):
                idx_j, t_j, h_j = hashes[j]
                dist = hamming_distance(h_i, h_j)
                if dist <= self.hamming_threshold:
                    duplicates[idx_j] = {
                        "is_duplicate": True,
                        "matched_scene_index": idx_i,
                        "matched_timestamp": t_i,
                        "hamming_distance": dist,
                        "confidence": round(1.0 - (dist / 16.0), 3)
                    }

        return duplicates
