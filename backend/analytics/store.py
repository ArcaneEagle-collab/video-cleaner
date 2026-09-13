import os
import time
import json
import sqlite3
from pathlib import Path
from typing import Dict, Any, List, Optional
from ..config import get_appdata_dir

def get_db_path() -> Path:
    app_data = get_appdata_dir()
    app_data.mkdir(parents=True, exist_ok=True)
    return app_data / "analytics.db"

def init_db():
    db_path = get_db_path()
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                install_id TEXT NOT NULL,
                event_name TEXT NOT NULL,
                timestamp REAL NOT NULL,
                app_version TEXT NOT NULL,
                os_platform TEXT NOT NULL,
                metadata_json TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_name ON events (event_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_install_id ON events (install_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp)")
        conn.commit()

# Ensure table initialized on module load
try:
    init_db()
except Exception:
    pass

ALLOWED_EVENTS = {
    "app_first_launch",
    "app_started",
    "app_closed",
    "video_imported",
    "analysis_started",
    "analysis_completed",
    "cleaning_started",
    "cleaning_completed",
    "clean_video_exported",
    "clip_exported",
    "processing_cancelled",
    "processing_error",
    "export_error",
    "application_error",
    "settings_opened",
    "analytics_enabled",
    "analytics_disabled",
    "update_check",
    "update_available",
    "update_completed"
}

def record_event(
    install_id: str,
    event_name: str,
    app_version: str = "1.0.0",
    os_platform: str = "Windows",
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    if event_name not in ALLOWED_EVENTS:
        return False

    # Strict privacy sanitization: remove paths, filenames, or oversized content
    clean_meta = {}
    if metadata and isinstance(metadata, dict):
        forbidden = ["path", "filepath", "filename", "file_name", "name", "dir", "user", "username"]
        for k, v in metadata.items():
            k_lower = str(k).lower()
            if any(f in k_lower for f in forbidden):
                continue
            if isinstance(v, (int, float, bool)):
                clean_meta[k] = v
            elif isinstance(v, str):
                # Don't save if looks like path
                if ":\\" in v or "/" in v or len(v) > 80:
                    continue
                clean_meta[k] = v

    now = time.time()
    db_path = get_db_path()
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO events (install_id, event_name, timestamp, app_version, os_platform, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    install_id[:64],
                    event_name,
                    now,
                    app_version[:20],
                    os_platform[:40],
                    json.dumps(clean_meta)
                )
            )
            conn.commit()
        return True
    except Exception:
        return False

def get_metrics_summary() -> Dict[str, Any]:
    db_path = get_db_path()
    if not db_path.exists():
        init_db()

    now = time.time()
    day_ago = now - 86400
    week_ago = now - (7 * 86400)
    month_ago = now - (30 * 86400)

    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()

        # Total unique installations
        cursor.execute("SELECT COUNT(DISTINCT install_id) FROM events")
        total_installations = cursor.fetchone()[0] or 0

        # Active users: today, week, month
        cursor.execute("SELECT COUNT(DISTINCT install_id) FROM events WHERE timestamp >= ?", (day_ago,))
        active_today = cursor.fetchone()[0] or 0

        cursor.execute("SELECT COUNT(DISTINCT install_id) FROM events WHERE timestamp >= ?", (week_ago,))
        active_week = cursor.fetchone()[0] or 0

        cursor.execute("SELECT COUNT(DISTINCT install_id) FROM events WHERE timestamp >= ?", (month_ago,))
        active_month = cursor.fetchone()[0] or 0

        # Event counts
        cursor.execute("SELECT event_name, COUNT(*) FROM events GROUP BY event_name")
        event_counts = dict(cursor.fetchall())

        total_videos_imported = event_counts.get("video_imported", 0)
        total_analyses_completed = event_counts.get("analysis_completed", 0)
        total_clean_videos = event_counts.get("clean_video_exported", 0)
        total_clips = event_counts.get("clip_exported", 0)
        total_cancellations = event_counts.get("processing_cancelled", 0)

        # Success rate vs error rate
        total_operations = total_analyses_completed + event_counts.get("processing_error", 0) + event_counts.get("export_error", 0)
        if total_operations > 0:
            success_count = total_analyses_completed + total_clean_videos + total_clips
            error_count = event_counts.get("processing_error", 0) + event_counts.get("export_error", 0) + event_counts.get("application_error", 0)
            success_rate = round((success_count / (success_count + error_count)) * 100, 1) if (success_count + error_count) > 0 else 100.0
            error_rate = round(100.0 - success_rate, 1)
        else:
            success_rate = 100.0
            error_rate = 0.0

        # Version breakdown
        cursor.execute("SELECT app_version, COUNT(DISTINCT install_id) FROM events GROUP BY app_version")
        version_dist = dict(cursor.fetchall())

        # Error events
        cursor.execute(
            """
            SELECT event_name, timestamp, app_version, metadata_json
            FROM events
            WHERE event_name IN ('processing_error', 'export_error', 'application_error')
            ORDER BY timestamp DESC
            LIMIT 25
            """
        )
        recent_errors = []
        for r in cursor.fetchall():
            meta = {}
            try:
                meta = json.loads(r[3])
            except Exception:
                pass
            recent_errors.append({
                "category": r[0],
                "timestamp": r[1],
                "time_formatted": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r[1])),
                "version": r[2],
                "details": meta
            })

    return {
        "overview": {
            "total_installations": total_installations,
            "active_today": active_today,
            "active_this_week": active_week,
            "active_this_month": active_month,
            "total_videos_processed": total_videos_imported,
            "analyses_completed": total_analyses_completed,
            "total_clean_videos_exported": total_clean_videos,
            "total_clips_exported": total_clips,
            "total_cancellations": total_cancellations,
            "success_rate": success_rate,
            "error_rate": error_rate
        },
        "event_counts": event_counts,
        "versions": version_dist,
        "recent_errors": recent_errors,
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S")
    }
