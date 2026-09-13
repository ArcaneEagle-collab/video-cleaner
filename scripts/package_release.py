import os
import sys
import subprocess
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE_DIR = ROOT / "release"

def log(msg: str):
    print(f"\n[Video Cleaner Release Engine] {msg}")

def run_cmd(cmd: list, cwd: Path = ROOT):
    log(f"Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(cwd))
    if res.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {res.returncode}: {' '.join(cmd)}")

def main():
    log("=== Starting Video Cleaner Production Release Packaging ===")

    # 1. Bundle FFmpeg
    ffmpeg_exe = ROOT / "resources" / "ffmpeg" / "ffmpeg.exe"
    ffprobe_exe = ROOT / "resources" / "ffmpeg" / "ffprobe.exe"
    if not (ffmpeg_exe.exists() and ffprobe_exe.exists()):
        log("Bundling FFmpeg & FFprobe...")
        run_cmd([sys.executable, str(ROOT / "scripts" / "bundle_ffmpeg.py")])
    else:
        log("Bundled FFmpeg and FFprobe verified.")

    # 2. Build Backend with PyInstaller
    server_exe = ROOT / "dist-backend" / "server" / "server.exe"
    if not server_exe.exists():
        log("Compiling standalone backend with PyInstaller...")
        run_cmd([sys.executable, str(ROOT / "scripts" / "build_backend.py")])
    else:
        log(f"Standalone backend verified: {server_exe} ({(server_exe.stat().st_size / (1024*1024)):.1f} MB)")

    # 3. Build Frontend with Vite
    frontend_dist = ROOT / "frontend" / "dist" / "index.html"
    if not frontend_dist.exists():
        log("Building Vite React frontend...")
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        run_cmd([npm_cmd, "run", "build"], cwd=ROOT / "frontend")
    else:
        log(f"Frontend production bundle verified: {frontend_dist}")

    # 4. Package Desktop App & NSIS Installer with electron-builder
    log("Building NSIS Installer with electron-builder...")
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    run_cmd([npx_cmd, "electron-builder", "--config", "electron-builder.json"])

    setup_exe = RELEASE_DIR / "VideoCleaner-Setup.exe"
    if not setup_exe.exists():
        raise FileNotFoundError(f"Installer was not created: {setup_exe}")
    log(f"Installer created: {setup_exe} ({(setup_exe.stat().st_size / (1024*1024)):.1f} MB)")

    # 5. Create VideoCleaner-Portable.zip from win-unpacked
    win_unpacked = RELEASE_DIR / "win-unpacked"
    if win_unpacked.exists():
        portable_zip = RELEASE_DIR / "VideoCleaner-Portable.zip"
        log(f"Creating portable zip distribution: {portable_zip}...")
        with zipfile.ZipFile(portable_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for root_path, _, files in os.walk(win_unpacked):
                for file in files:
                    full_file = Path(root_path) / file
                    rel_path = full_file.relative_to(win_unpacked)
                    # Put inside a top-level VideoCleaner folder in zip
                    archive_name = Path("VideoCleaner") / rel_path
                    zf.write(full_file, arcname=str(archive_name))
        log(f"Portable zip created: {portable_zip} ({(portable_zip.stat().st_size / (1024*1024)):.1f} MB)")

    # 6. Generate SHA256 Checksums
    log("Generating release SHA-256 checksums...")
    run_cmd([sys.executable, str(ROOT / "scripts" / "generate_checksums.py")])

    log("=== PRODUCTION PACKAGING COMPLETE ===")

if __name__ == "__main__":
    main()
