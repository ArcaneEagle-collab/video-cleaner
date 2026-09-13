# Video Cleaner

> Automatically detect image-based sections in edited videos and extract usable video clips.

Video Cleaner is a high-performance, local-first computer vision desktop application created by **Amna**. It inspects edited and composite videos, detects non-video elements (still photos, Ken Burns artificial zooms/pans, solid-background cutouts, graphic overlays, and transitions), and extracts usable continuous footage into organized clips and master videos.

---

## Features

- **Static image detection**: Structural similarity (SSIM), perceptual hashing (dHash), HSV color histograms, and sensor noise analysis.
- **Zoom/pan image detection**: Farneback dense optical flow vector field decomposition to isolate synthetic 2D camera motion from 3D parallax.
- **Transition detection**: Luminance curve drops/spikes (dip to black/white), monotonic crossfades, and wipes.
- **Motion analysis**: Spatial grid decomposition separating local micro-motions from uniform global camera motion.
- **Scene segmentation**: Scene cut detection with fallback continuous windowing.
- **Manual Keep/Remove controls**: Interactive timeline scrubber, frame-by-frame player, and one-click classification overrides.
- **Automatic clip extraction**: Frame-accurate trimming and extraction of all approved footage.
- **Combined clean-video export**: Seamless concatenation of all surviving cuts into a unified master video.
- **Local processing**: 100% offline computer vision; video frames and audio never leave your device.
- **Privacy-conscious anonymous analytics**: Optional telemetry for error reporting that can be completely disabled anytime.
- **Windows desktop application**: Native 64-bit desktop experience with zero technical dependencies required.

---

## Download & Installation

### Download
Download the latest Windows installer from the [Releases](https://github.com/ArcaneEagle-collab/video-cleaner/releases) page:

- **Primary Installer**: `VideoCleaner-Setup.exe`
- **Portable Version**: `VideoCleaner-Portable.zip`

### Installation Steps

1. Download **`VideoCleaner-Setup.exe`**.
2. Run the installer (if Microsoft Defender SmartScreen prompts, select *More info* → *Run anyway*).
3. Follow the simple installation steps.
4. Launch **Video Cleaner** from your Desktop shortcut or Start Menu.
5. Import a video (drag and drop supported).
6. Click **Start Video Analysis**.
7. Review detected segments on the color-coded interactive timeline.
8. Click **Export Footage** to obtain clean clips and your master video.

> [!NOTE]
> You do **not** need to install Python, Node.js, FFmpeg, OpenCV, or any development tools. Everything is bundled into the installer.

---

## Privacy

Video processing happens locally on your computer.

Video Cleaner does not upload your videos for normal processing. Video frames, audio tracks, and filenames remain private on your machine.

If anonymous analytics is enabled, the application may send basic anonymous usage information such as application version, feature usage, and general error telemetry to help improve stability.

Analytics can be easily disabled at any time from **Settings &rarr; Privacy & Analytics**.

---

## System Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Processor**: Intel Core i3 / AMD Ryzen 3 or higher
- **Memory**: 4 GB RAM minimum (8 GB recommended for 4K video processing)
- **Disk Space**: ~500 MB for application installation

---

## Verification (SHA-256)

To verify the integrity of your download:

```powershell
Get-FileHash VideoCleaner-Setup.exe -Algorithm SHA256
```

Compare the output hash against `SHA256SUMS.txt` available on the Releases page.

---

## Documentation

- [DEVELOPMENT.md](DEVELOPMENT.md): Guide for developers building from source code.
- [CHANGELOG.md](CHANGELOG.md): Version history and release notes.
- [LICENSE](LICENSE): Proprietary software license notice.
