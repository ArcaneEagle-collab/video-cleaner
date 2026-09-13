import os
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE_DIR = ROOT / "release"

def main():
    print("=== GitHub Release Publisher for Video Cleaner ===")
    
    # Check for gh executable
    gh_cmd = "gh"
    which_gh = subprocess.run(["where.exe", "gh"], capture_output=True, text=True)
    if which_gh.returncode != 0:
        default_gh = Path("C:/Program Files/GitHub CLI/gh.exe")
        if default_gh.exists():
            gh_cmd = str(default_gh)
        else:
            print("Error: GitHub CLI (gh) is not installed or found in PATH.")
            print("Please install it or login using: winget install GitHub.cli")
            sys.exit(1)

    # Check authentication
    auth_check = subprocess.run([gh_cmd, "auth", "status"], capture_output=True, text=True)
    if auth_check.returncode != 0:
        print("\n[Action Required] You are not logged into GitHub.")
        print("Please run the following command to authenticate your GitHub account:")
        print("  gh auth login\n")
        print("Follow the interactive prompts (choose GitHub.com, HTTPS, and login with browser).")
        print("Once authenticated, run this script again to publish the release:\n")
        print("  python scripts/create_github_release.py\n")
        sys.exit(1)

    tag = "v1.0.0"
    title = "Video Cleaner v1.0.0"
    notes = """# Video Cleaner v1.0.0

Initial public release.

## Features
- Automatic image detection
- Zoom/pan detection
- Scene detection
- Motion analysis
- Usable clip extraction
- Combined clean-video export
- Windows installer
- Local video processing
- Privacy-conscious anonymous analytics

## Windows Download
- Download `VideoCleaner-Setup.exe`
- Verify checksum with `SHA256SUMS.txt`
"""

    notes_file = RELEASE_DIR / "release_notes.md"
    notes_file.write_text(notes, encoding="utf-8")

    assets = []
    setup_exe = RELEASE_DIR / "VideoCleaner-Setup.exe"
    portable_zip = RELEASE_DIR / "VideoCleaner-Portable.zip"
    checksums = RELEASE_DIR / "SHA256SUMS.txt"

    if setup_exe.exists():
        assets.append(str(setup_exe))
    if portable_zip.exists():
        assets.append(str(portable_zip))
    if checksums.exists():
        assets.append(str(checksums))

    if not assets:
        print("Error: No release assets found in release/ directory. Run python scripts/package_release.py first.")
        sys.exit(1)

    print(f"Publishing release {tag} with assets:")
    for a in assets:
        print(f"  - {a}")

    cmd = [
        gh_cmd, "release", "create", tag,
        *assets,
        "--title", title,
        "--notes-file", str(notes_file)
    ]

    res = subprocess.run(cmd)
    if res.returncode == 0:
        print(f"\nSuccessfully created and published release {tag} on GitHub!")
    else:
        print(f"\nFailed to create release (exit code {res.returncode}).")

if __name__ == "__main__":
    main()
