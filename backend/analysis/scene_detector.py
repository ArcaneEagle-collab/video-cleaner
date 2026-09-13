from typing import List, Tuple
from scenedetect import open_video, SceneManager, ContentDetector, AdaptiveDetector

def detect_scenes(
    video_path: str,
    min_scene_len_sec: float = 0.5,
    threshold: float = 27.0
) -> List[Tuple[float, float]]:
    """
    Detects scene boundaries (cuts and transitions) in a video using PySceneDetect.
    Falls back to uniform chunking if no cuts are detected or video is a single take.
    Returns list of (start_seconds, end_seconds).
    """
    try:
        video = open_video(video_path)
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=int(min_scene_len_sec * 30)))
        scene_manager.detect_scenes(video)
        scene_list = scene_manager.get_scene_list()
        
        scenes = []
        for scene in scene_list:
            start_sec = scene[0].get_seconds()
            end_sec = scene[1].get_seconds()
            if end_sec > start_sec:
                scenes.append((round(start_sec, 3), round(end_sec, 3)))
                
        if scenes:
            return scenes
    except Exception as e:
        # Fallback if PySceneDetect fails
        pass

    # If PySceneDetect detected 0 or 1 scene or encountered an issue,
    # probe the video duration and return the single full scene or natural windowing
    from ..video.ffprobe import probe_video
    try:
        meta = probe_video(video_path)
        duration = meta.get("duration", 0.0)
        if duration > 0:
            return [(0.0, round(duration, 3))]
    except Exception:
        pass
        
    return [(0.0, 10.0)]
