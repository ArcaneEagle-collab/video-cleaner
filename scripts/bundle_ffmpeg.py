import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "resources" / "ffmpeg"
DEST.mkdir(parents=True, exist_ok=True)

# Find ffmpeg and ffprobe on system
ffmpeg_src = None
ffprobe_src = None

# 1. Check WinGet package location
winget_dir = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
for p in winget_dir.glob("**/bin/ffmpeg.exe"):
    ffmpeg_src = p
    ffprobe_src = p.parent / "ffprobe.exe"
    break

# 2. Check system PATH
if not ffmpeg_src or not ffmpeg_src.exists():
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        ffmpeg_src = Path(which_ffmpeg)
        which_ffprobe = shutil.which("ffprobe")
        if which_ffprobe:
            ffprobe_src = Path(which_ffprobe)

if not ffmpeg_src or not ffmpeg_src.exists():
    raise RuntimeError("Could not locate ffmpeg.exe to bundle.")
if not ffprobe_src or not ffprobe_src.exists():
    raise RuntimeError("Could not locate ffprobe.exe to bundle.")

print(f"Bundling FFmpeg from: {ffmpeg_src}")
print(f"Bundling FFprobe from: {ffprobe_src}")

shutil.copy2(ffmpeg_src, DEST / "ffmpeg.exe")
shutil.copy2(ffprobe_src, DEST / "ffprobe.exe")

ffmpeg_size = (DEST / "ffmpeg.exe").stat().st_size / (1024 * 1024)
ffprobe_size = (DEST / "ffprobe.exe").stat().st_size / (1024 * 1024)

print(f"Successfully bundled ffmpeg.exe ({ffmpeg_size:.1f} MB) and ffprobe.exe ({ffprobe_size:.1f} MB) into {DEST}")
