import os
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(root_dir))

from backend.analysis.classifier import VideoAnalysisPipeline
from backend.video.exporter import VideoExporter

def test_pipeline():
    pipeline = VideoAnalysisPipeline(sensitivity="Medium")
    exporter = VideoExporter(output_root="outputs")

    test_files = [
        ("Test A (Real Continuous)", "test_assets/test_a_real_continuous_footage.mp4", "KEEP"),
        ("Test B (Static Slideshow)", "test_assets/test_b_static_slideshow.mp4", "REMOVE"),
        ("Test C (Ken Burns Zoom)", "test_assets/test_c_ken_burns_zoom.mp4", "REMOVE"),
        ("Test D (Slow Camera Motion)", "test_assets/test_d_slow_camera_movement.mp4", "KEEP"),
        ("Test E (Mixed Video)", "test_assets/test_e_mixed_video.mp4", "MIXED"),
        ("Test F (Talking Head)", "test_assets/test_f_talking_head.mp4", "KEEP"),
    ]

    for name, filepath, expected in test_files:
        print(f"\n==========================================")
        print(f"Running {name} on {filepath}")
        print(f"==========================================")

        res = pipeline.run(filepath)
        segments = res["segments"]
        print(f"Detected {len(segments)} segments:")
        for seg in segments:
            print(f"  [{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['classification']} (conf: {seg['confidence_percent']}%) -> Action: {seg['action']} | Reason: {seg['reason']}")

        # Test Exporting on Test E (Mixed Video)
        if expected == "MIXED":
            print("\n--- Testing Exporting on Test E ---")
            export_res = exporter.export(
                video_path=filepath,
                segments=segments,
                export_settings={
                    "export_combined": True,
                    "export_individual": True,
                    "quality": "High",
                    "include_audio": True,
                    "codec": "libx264",
                    "padding_sec": 0.2
                }
            )
            print(f"Export status: {export_res['status']}")
            print(f"Surviving clips count: {export_res.get('surviving_clips_count')}")
            if export_res.get("combined_video"):
                print(f"Combined clean video: {export_res['combined_video']['filename']} ({export_res['combined_video']['size_mb']} MB)")
            for clip in export_res.get("individual_clips", []):
                print(f"  Clip: {clip['filename']} [{clip['start']}s - {clip['end']}s] ({clip['size_mb']} MB)")

if __name__ == "__main__":
    test_pipeline()
