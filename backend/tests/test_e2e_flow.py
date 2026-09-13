import json
import time
import requests
import websockets
import asyncio
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

async def test_full_flow():
    print("1. Checking API Root...")
    r = requests.get(f"{BASE_URL}/")
    assert r.status_code == 200
    print("API Root OK:", r.json())

    print("\n2. Getting Pre-synthesized Test Videos...")
    r = requests.get(f"{BASE_URL}/api/test-videos")
    assert r.status_code == 200
    test_videos = r.json().get("test_videos", [])
    print(f"Found {len(test_videos)} test videos.")

    # Select Test E Mixed Video
    test_e = next(v for v in test_videos if "mixed" in v["filename"].lower())
    print("Selected video:", test_e["filename"], "duration:", test_e["metadata"]["duration"], "s")

    print("\n3. Testing Analysis via /api/analyze with WebSocket progress listener...")
    async with websockets.connect(WS_URL) as ws:
        # Trigger analysis
        analyze_payload = {
            "video_path": test_e["filepath"],
            "sensitivity": "Medium",
            "min_clip_duration": 2.0,
            "min_clip_gap": 0.3,
            "detect_static": True,
            "detect_zoom_pan": True,
            "detect_transitions": True,
            "detect_background": True,
            "detect_repeated": True,
            "detect_motion": True,
            "ai_assisted": False
        }
        r = requests.post(f"{BASE_URL}/api/analyze", json=analyze_payload)
        assert r.status_code == 200
        task_id = r.json()["task_id"]
        print(f"Started analysis task: {task_id}")

        # Listen for WebSocket updates
        completed_result = None
        while True:
            msg_str = await asyncio.wait_for(ws.recv(), timeout=30.0)
            msg = json.loads(msg_str)
            if msg.get("type") == "progress":
                print(f"  [Progress] {msg.get('stage')}: {msg.get('percent')}% (scenes: {msg.get('scenes_detected')}, likely images: {msg.get('likely_images')})")
            elif msg.get("type") == "completed":
                print(f"  [Completed] Analysis finished successfully!")
                completed_result = msg.get("result")
                break
            elif msg.get("type") == "error":
                raise RuntimeError(f"Analysis failed: {msg.get('error')}")

        assert completed_result is not None
        segments = completed_result["segments"]
        print(f"\n4. Received {len(segments)} classified segments:")
        for s in segments:
            print(f"   [{s['start']:.1f}s - {s['end']:.1f}s] {s['classification']} ({s['confidence_percent']}%) -> {s['action']} | {s['reason']}")

        # Test Export
        print("\n5. Triggering Export via /api/export...")
        export_payload = {
            "video_path": test_e["filepath"],
            "segments": segments,
            "export_combined": True,
            "export_individual": True,
            "quality": "High",
            "include_audio": True,
            "codec": "libx264",
            "padding_sec": 0.2
        }
        r = requests.post(f"{BASE_URL}/api/export", json=export_payload)
        assert r.status_code == 200
        export_data = r.json()
        print("Export Response:", json.dumps(export_data, indent=2))

        assert export_data["status"] == "success"
        combined_file = export_data.get("combined_video")
        if combined_file:
            print(f"Clean Master Video Created: {combined_file['filename']} ({combined_file['size_mb']} MB)")
            # Verify file exists on disk
            assert Path(combined_file["filepath"]).exists()
            assert Path(combined_file["filepath"]).stat().st_size > 1000

        print(f"Extracted {len(export_data['individual_clips'])} individual clips:")
        for c in export_data["individual_clips"]:
            print(f"  - {c['filename']} ({c['size_mb']} MB)")
            assert Path(c["filepath"]).exists()
            assert Path(c["filepath"]).stat().st_size > 1000

    print("\n==========================================")
    print("ALL END-TO-END SYSTEM TESTS PASSED 100%!")
    print("==========================================")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
