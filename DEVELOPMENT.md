# Video Cleaner — Developer & Engineering Guide

This document contains instructions for engineers maintaining, developing, and releasing Video Cleaner.

---

## 1. Architecture Overview

Video Cleaner uses a hybrid local-desktop architecture designed for zero-configuration end-user deployment:

```text
┌─────────────────────────────────────────────────────────────┐
│                 Video Cleaner.exe (Electron)                │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │     Vite React UI     │ <───> │ IPC & Desktop Bridge  │  │
│  │ (HTML5 Canvas/Video)  │  HTTP │ (preload.js / main.js)│  │
│  └───────────────────────┘ & WS  └───────────────────────┘  │
│              │                               │              │
└──────────────┼───────────────────────────────┼──────────────┘
               ▼                               ▼
    ┌───────────────────────┐       ┌───────────────────────┐
    │  FastAPI Backend App  │       │   Process Lifecycle   │
    │  (server.exe bundle)  │       │  - Dynamic Free Port  │
    └───────────────────────┘       │  - CREATE_NO_WINDOW   │
               │                    │  - Graceful Shutdown  │
               ▼                    └───────────────────────┘
    ┌───────────────────────┐
    │ Computer Vision Engine│
    │  - OpenCV Farneback   │
    │  - PySceneDetect      │
    │  - Bundled FFmpeg     │
    └───────────────────────┘
```

### Components:
1. **Desktop Shell (`desktop/`)**:
   - Manages single-instance application locking (`app.requestSingleInstanceLock()`).
   - Automatically finds an available local port on `127.0.0.1` starting at 8000.
   - Silently spawns the backend process without console windows (`CREATE_NO_WINDOW`).
   - Conducts health-check polling before revealing the window.
   - Cleans up child processes (`server.exe` and any child `ffmpeg.exe` processes) on exit.
2. **Backend (`backend/`)**:
   - FastAPI server with WebSocket progress broadcasting.
   - Computer vision algorithms (`backend/analysis/`).
   - Video metadata inspection and frame extraction (`backend/video/`).
   - Standalone runner (`backend/server_entry.py`).
   - Configuration and Windows AppData directory management (`backend/config.py`).
3. **Frontend (`frontend/`)**:
   - React 19 + TypeScript + Vite + Lucide React.
   - Scrubber timeline, segment editor HUD, export modal, and batch queue.
   - Settings modal (`frontend/src/components/SettingsModal.tsx`) with Storage, Diagnostics, Privacy, and About tabs.
   - Dynamic API port resolver (`frontend/src/config/api.ts`).
4. **Bundled Dependencies (`resources/`)**:
   - `resources/ffmpeg/ffmpeg.exe`: Complete 64-bit FFmpeg binary.
   - `resources/ffmpeg/ffprobe.exe`: Complete 64-bit FFprobe binary.
   - `dist-backend/server/`: Self-contained PyInstaller build with Python 3.11 runtime and all C extensions (OpenCV, NumPy).

---

## 2. Prerequisites for Local Development

- **Python**: 3.10 or 3.11 (64-bit)
- **Node.js**: 18, 20, or 24 LTS
- **Git**
- **FFmpeg & FFprobe**: Either on system PATH or bundled in `resources/ffmpeg/`.

---

## 3. Setting Up the Development Environment

### 1. Install Backend Dependencies
From the project root:
```bash
python -m pip install -r backend/requirements.txt
python -m pip install pyinstaller
```

### 2. Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

### 3. Install Root Packaging Dependencies
```bash
npm install
```

---

## 4. Running in Development Mode

### Option A: Run Electron Shell with Pre-built Backend & Frontend
```bash
npm run desktop:start
```

### Option B: Run Services Individually (for active UI/API coding)
**Terminal 1 (Backend)**:
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend Dev Server)**:
```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```
Open your browser at `http://127.0.0.1:5173/`.

---

## 5. Running the Test Suite

### Automated Detection Pipeline Tests (Synthetic Benchmarks A–F):
```bash
python backend/tests/test_pipeline.py
```
This tests:
- Real continuous video (Keep)
- Static slide presentation (Remove)
- Ken Burns pan/zoom (Remove)
- Slow camera parallax motion (Keep)
- Mixed footage with transitions and clean export (Segment & Export)
- Talking head subtle motion guard (Keep)

### End-to-End Packaged App Test:
```bash
python scripts/test_packaged_e2e.py
```
Launches the packaged standalone `Video Cleaner.exe`, verifies health check and API communication on dynamic port, executes video analysis and export, and verifies clean process exit.

---

## 6. Building Production Releases

To produce a clean release build from scratch:

```bash
python scripts/package_release.py
```

This single command executes the full release pipeline:
1. **Bundles FFmpeg**: Copies verified 64-bit `ffmpeg.exe` and `ffprobe.exe` into `resources/ffmpeg/`.
2. **Compiles Standalone Backend**: Uses PyInstaller to build `dist-backend/server/server.exe` with all OpenCV and NumPy C extensions.
3. **Builds Frontend**: Runs Vite production build (`frontend/dist`).
4. **Packages Desktop App**: Runs `electron-builder` with NSIS configuration to generate:
   - `release/VideoCleaner-Setup.exe` (Professional Windows installer)
   - `release/win-unpacked/` (Unpacked portable directory)
5. **Generates Portable Zip**: Compresses `win-unpacked` into `release/VideoCleaner-Portable.zip`.
6. **Generates Checksums**: Computes SHA-256 hashes and saves them to `release/SHA256SUMS.txt`.

---

## 7. Versioning & Creating New Releases

Video Cleaner follows Semantic Versioning (`MAJOR.MINOR.PATCH`).

When bumping versions:
1. Update `version` in `package.json` (root).
2. Update `version` in `frontend/package.json`.
3. Update `DEFAULT_SETTINGS["version"]` in `backend/config.py`.
4. Update version strings in `backend/main.py` and `frontend/src/components/SettingsModal.tsx`.
5. Add release notes in `CHANGELOG.md`.
6. Run `python scripts/package_release.py`.

---

## 8. Code Signing (Optional / Future Releases)

To eliminate Microsoft Defender SmartScreen warnings on newly published builds:
1. Obtain an EV (Extended Validation) or standard Windows code-signing certificate (PFX file or HSM token).
2. In `electron-builder.json`, configure:
   ```json
   "win": {
     "certificateFile": "path/to/certificate.pfx",
     "certificatePassword": "env:CSC_KEY_PASSWORD"
   }
   ```
3. Run `npm run dist`.
