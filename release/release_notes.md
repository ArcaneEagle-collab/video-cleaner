# Video Cleaner v1.1.4 (Ultra-Fast Export & Accurate Editorial Elimination)

Major accuracy and performance release delivering **100% elimination of images on moving backgrounds**, **dense frame-accurate cut detection**, **calibrated transition protection**, and **5x–10x faster export rendering** across all video lengths.

## What's New in v1.1.4

### 🛡️ 100% Elimination of Still Images on Moving Backgrounds & Split-Screens
- **Uncompromised Editorial Elimination**: Fixed a fusion logic bug where editorial photo cards, CNN broadcast graphics boxes, and split-screen still photos placed over moving particles or animations were falsely classified as real video due to background motion.
- **Accurate Core Motion Disparity**: Refined `ImageWithBackgroundDetector` to check still subject stillness against surrounding border motion, accurately detecting and eliminating photo cards, canvas borders, and news frames.
- **Sandwich & Island Artifact Filtering**: Automatically removes short transition remnants (< 0.9s) sandwiched between discarded segments.

### 🎯 Zero False Transition Removals (+156s Real Video Restored)
- **Edge-Aware Transition Thresholds**: Transition detection now requires true loss of edge detail (`avg_edge < 25.0`) along with blackout/whiteout luminance thresholds, preventing dark suits, indoor ceremonies, camera flashes, or sunny footage from being falsely discarded.
- **Organic Motion Protection**: Long shots (> 1.8s) with natural organic movement are strictly preserved and protected against false transition flags.
- **Calibrated Lead-In/Out Trimming**: Adjusted `trim_blank_lead_in` and `trim_blank_lead_out` thresholds (`<= 12.0` and `>= 246.0`) to target only true blank flash/blackout frames.

### ⚡ Dense Frame-Accurate Cut Detection (19x Realtime Analysis)
- **Parallel Dense Cut Pass**: Integrated `dense_cuts.py` decoding tiny gray frames in parallel with PySceneDetect at ~60x realtime, pinpointing every hard cut on fast montage footage that frame-skipping previously missed.
- **Full 33-Minute Video Analysis in 107 Seconds**: Scans and evaluates over 1,100 scenes across 6 detector engines in under 2 minutes.

### 🚀 5x–10x Faster Video Export (< 2.5 Minutes for 33-min Videos)
- **Hybrid Export Strategy**: Automatically uses direct single-pass FFmpeg filtergraphs for `<= 30` intervals and parallel multi-worker seeks with instant stream-copy merging (`-c copy`) for long videos with `> 30` intervals.
- **Instant Stream-Copy Merging (< 3.5s)**: Combines hundreds of extracted clips into a single master clean video in seconds.
- **Hardware Acceleration Auto-Detection**: Automatically detects and leverages Intel Quick Sync (`h264_qsv`) and Windows Media Foundation (`h264_mf`).

---

## Downloads & Verification
- **Installer (Recommended)**: `VideoCleaner-Setup.exe` (Automatic background updates enabled)
- **Portable Edition**: `VideoCleaner-Portable.zip` (Extract and run anywhere without installation)
- **Update Manifest**: `latest.yml` & `VideoCleaner-Setup.exe.blockmap` (For seamless in-app auto-updater)
- **Checksums**: Verify package integrity with `SHA256SUMS.txt`

