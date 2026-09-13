import os
import sys
import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

APP_NAME = "Video Cleaner"

def get_appdata_dir() -> Path:
    override = os.environ.get("VIDEO_CLEANER_DATA_DIR")
    if override:
        p = Path(override)
    elif os.name == "nt":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        p = Path(appdata) / APP_NAME
    else:
        p = Path.home() / ".videocleaner"
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_temp_dir() -> Path:
    override = os.environ.get("VIDEO_CLEANER_TEMP_DIR")
    if override:
        p = Path(override)
    elif os.name == "nt":
        localappdata = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        p = Path(localappdata) / APP_NAME / "temp"
    else:
        p = Path.home() / ".videocleaner" / "temp"
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_logs_dir() -> Path:
    override = os.environ.get("VIDEO_CLEANER_LOGS_DIR")
    if override:
        p = Path(override)
    else:
        p = get_appdata_dir() / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_default_outputs_dir() -> Path:
    override = os.environ.get("VIDEO_CLEANER_OUTPUTS_DIR")
    if override:
        p = Path(override)
    elif os.name == "nt":
        videos_folder = Path.home() / "Videos"
        if videos_folder.exists():
            p = videos_folder / APP_NAME
        else:
            p = Path.home() / APP_NAME / "Outputs"
    else:
        p = Path.home() / "Videos" / APP_NAME
    p.mkdir(parents=True, exist_ok=True)
    return p

SETTINGS_FILE = get_appdata_dir() / "settings.json"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "version": "1.0.0",
    "output_dir": str(get_default_outputs_dir().resolve()),
    "temp_dir": str(get_temp_dir().resolve()),
    "analytics_enabled": False,
    "sensitivity": "Medium",
    "min_clip_duration": 2.0,
    "quality": "High",
    "codec": "libx264"
}

def load_settings() -> Dict[str, Any]:
    settings = dict(DEFAULT_SETTINGS)
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    settings.update(saved)
        except Exception:
            pass
    return settings

def save_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
    current = load_settings()
    current.update(new_settings)
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
    except Exception as e:
        print(f"Warning: Failed to save settings to {SETTINGS_FILE}: {e}")
    return current

def get_temp_size_bytes() -> int:
    temp_dir = Path(load_settings().get("temp_dir", str(get_temp_dir())))
    total_size = 0
    if temp_dir.exists():
        for dirpath, _, filenames in os.walk(temp_dir):
            for f in filenames:
                fp = Path(dirpath) / f
                try:
                    if fp.is_file():
                        total_size += fp.stat().st_size
                except Exception:
                    pass
    return total_size

def clear_temp_files() -> Dict[str, Any]:
    temp_dir = Path(load_settings().get("temp_dir", str(get_temp_dir())))
    deleted_count = 0
    reclaimed_bytes = 0
    if temp_dir.exists():
        for item in temp_dir.iterdir():
            try:
                if item.is_file() or item.is_symlink():
                    sz = item.stat().st_size
                    item.unlink()
                    deleted_count += 1
                    reclaimed_bytes += sz
                elif item.is_dir():
                    for dirpath, _, filenames in os.walk(item):
                        for f in filenames:
                            try:
                                fp = Path(dirpath) / f
                                sz = fp.stat().st_size
                                reclaimed_bytes += sz
                                deleted_count += 1
                            except Exception:
                                pass
                    shutil.rmtree(item, ignore_errors=True)
            except Exception:
                pass
    # Re-create upload and cache subdirectories
    (temp_dir / "uploads").mkdir(parents=True, exist_ok=True)
    return {
        "deleted_count": deleted_count,
        "reclaimed_bytes": reclaimed_bytes,
        "reclaimed_mb": round(reclaimed_bytes / (1024 * 1024), 2)
    }
