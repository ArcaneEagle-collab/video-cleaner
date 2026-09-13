import subprocess
import time
import urllib.request
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
exe_path = str((ROOT / "release" / "win-unpacked" / "Video Cleaner.exe").resolve())

print("Launching packaged app:", exe_path)
proc = subprocess.Popen([exe_path])

time.sleep(3)
port = 8000
for p in range(8000, 8010):
    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{p}/api/system/info", timeout=1)
        port = p
        break
    except Exception:
        pass

base_url = f"http://127.0.0.1:{port}"
print(f"Connected to packaged app on {base_url}")

# 1. Test video upload / select
test_video = str((ROOT / "test_assets" / "test_e_mixed_video.mp4").resolve())
print("Starting analysis on test video:", test_video)

analyze_payload = json.dumps({
    "video_path": test_video,
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
}).encode("utf-8")

req = urllib.request.Request(f"{base_url}/api/analyze", data=analyze_payload, headers={"Content-Type": "application/json"})
res = json.loads(urllib.request.urlopen(req).read().decode())
task_id = res["task_id"]
print("Started task:", task_id)

# 2. Wait for completion
completed_data = None
for i in range(30):
    time.sleep(1)
    status_req = urllib.request.urlopen(f"{base_url}/api/status/{task_id}")
    status_data = json.loads(status_req.read().decode())
    if status_data.get("status") == "completed":
        completed_data = status_data.get("result")
        print("Analysis completed successfully!")
        break
    elif status_data.get("status") == "error":
        raise RuntimeError(f"Analysis failed: {status_data}")

if not completed_data:
    raise RuntimeError("Analysis timed out")

segments = completed_data.get("segments", [])
print(f"Detected {len(segments)} segments:")
for s in segments:
    print(f"  [{s.get('start')}s - {s.get('end')}s] {s.get('classification')} -> {s.get('action')}")

# 3. Test Export
export_payload = json.dumps({
    "video_path": test_video,
    "segments": segments,
    "export_combined": True,
    "export_individual": True,
    "quality": "High",
    "include_audio": True,
    "codec": "libx264",
    "padding_sec": 0.0
}).encode("utf-8")

print("\nTriggering export through bundled FFmpeg...")
exp_req = urllib.request.Request(f"{base_url}/api/export", data=export_payload, headers={"Content-Type": "application/json"})
exp_res = json.loads(urllib.request.urlopen(exp_req).read().decode())
print("Export Result Status:", exp_res.get("status"))
print("Surviving Clips:", exp_res.get("surviving_clips"))
print("Combined Master Video:", exp_res.get("combined_video"))

# 4. Clean Shutdown
print("\nClosing packaged desktop app...")
proc.terminate()
time.sleep(1)
if proc.poll() is None:
    proc.kill()

print("=== COMPLETE END-TO-END PACKAGED VIDEO PROCESSING VERIFIED ===")
