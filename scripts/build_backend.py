import os
import sys
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist-backend"
BUILD_DIR = ROOT / "build-backend"

hidden_imports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "starlette",
    "scenedetect",
    "scenedetect.backends.pyav",
    "scenedetect.backends.opencv",
    "av",
    "asyncio.windows_events",
    "cv2",
    "numpy",
    "PIL",
    "multipart",
    "websockets",
    "pydantic",
    "backend.main",
    "backend.config",
    "backend.api.routes",
    "backend.api.websocket",
    "backend.video.ffmpeg",
    "backend.video.ffprobe",
    "backend.video.exporter",
    "backend.analysis.scene_detector",
    "backend.analysis.static_detector",
    "backend.analysis.zoom_detector",
    "backend.analysis.transition_detector",
    "backend.analysis.background_detector",
    "backend.analysis.motion_detector",
    "backend.analysis.duplicate_detector",
    "backend.analysis.classifier",
    "backend.analytics.store",
    "sqlite3"
]

cmd = [
    sys.executable,
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--windowed",
    "--name", "server",
    "--distpath", str(DIST_DIR),
    "--workpath", str(BUILD_DIR),
    f"--add-data={ROOT / 'backend'};backend",
]

for hi in hidden_imports:
    cmd.extend(["--hidden-import", hi])

# Icon
icon_path = ROOT / "video_cleaner.ico"
if icon_path.exists():
    cmd.extend(["--icon", str(icon_path)])

cmd.append(str(ROOT / "backend" / "server_entry.py"))

print("Running PyInstaller to compile standalone backend...")
print("Command:", " ".join(cmd[:10]), "...")

res = subprocess.run(cmd, cwd=str(ROOT))
if res.returncode != 0:
    raise RuntimeError(f"PyInstaller failed with code {res.returncode}")

server_exe = DIST_DIR / "server" / "server.exe"
if not server_exe.exists():
    raise FileNotFoundError(f"Expected output not found: {server_exe}")

print(f"Backend successfully built into {server_exe}")
