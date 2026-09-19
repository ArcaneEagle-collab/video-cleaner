import os
import sys
import argparse
import signal
from pathlib import Path

# Ensure project root is in sys.path
if getattr(sys, "frozen", False):
    # Running in PyInstaller bundle
    bundle_dir = Path(sys.executable).parent
    sys.path.insert(0, str(bundle_dir))
    sys.path.insert(0, str(bundle_dir / "_internal"))
else:
    root_dir = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(root_dir))

def main():
    parser = argparse.ArgumentParser(description="Video Cleaner Backend Server by Amna")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--data-dir", default=None, help="Application data directory")
    parser.add_argument("--temp-dir", default=None, help="Temporary processing directory")
    parser.add_argument("--outputs-dir", default=None, help="Output videos directory")
    parser.add_argument("--ffmpeg-dir", default=None, help="Directory containing ffmpeg.exe and ffprobe.exe")
    parser.add_argument("--logs-dir", default=None, help="Directory for log files")
    parser.add_argument("--version", action="store_true", help="Print version and exit")

    args = parser.parse_args()

    if args.version:
        print("Video Cleaner Backend 1.0.0 by Amna")
        sys.exit(0)

    # Set environment variables from CLI args
    if args.data_dir:
        os.environ["VIDEO_CLEANER_DATA_DIR"] = str(Path(args.data_dir).resolve())
    if args.temp_dir:
        os.environ["VIDEO_CLEANER_TEMP_DIR"] = str(Path(args.temp_dir).resolve())
    if args.outputs_dir:
        os.environ["VIDEO_CLEANER_OUTPUTS_DIR"] = str(Path(args.outputs_dir).resolve())
    if args.ffmpeg_dir:
        os.environ["FFMPEG_DIR"] = str(Path(args.ffmpeg_dir).resolve())
    if args.logs_dir:
        os.environ["VIDEO_CLEANER_LOGS_DIR"] = str(Path(args.logs_dir).resolve())

    # Configure logging
    from backend.config import get_logs_dir
    log_file = get_logs_dir() / "backend.log"
    try:
        sys.stdout = open(log_file, "a", encoding="utf-8", buffering=1)
        sys.stderr = sys.stdout
    except Exception:
        pass

    print(f"--- Starting Video Cleaner Backend 1.0.0 (Host: {args.host}, Port: {args.port}) ---")

    try:
        # Import backend app
        import asyncio
        if sys.platform == "win32":
            # Use SelectorEventLoop on Windows to completely eliminate Proactor pipe/socket write assertion errors
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

        from backend.main import app
        import uvicorn

        # Setup graceful termination handler
        def handle_exit(signum, frame):
            print(f"Received shutdown signal ({signum}), closing backend...")
            sys.exit(0)

        signal.signal(signal.SIGINT, handle_exit)
        signal.signal(signal.SIGTERM, handle_exit)
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, handle_exit)

        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level="info",
            access_log=False
        )
    except Exception as e:
        import traceback
        print(f"FATAL: Backend failed to start: {e}")
        traceback.print_exc()
        if hasattr(sys.stdout, "flush"):
            sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
