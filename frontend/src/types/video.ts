export interface VideoMetadata {
  filename: string;
  filepath: string;
  duration: number;
  width: number;
  height: number;
  resolution: string;
  fps: number;
  file_size: number;
  file_size_mb: number;
  codec_name: string;
  has_audio: boolean;
  audio_codec?: string;
  bitrate?: number;
  upload_id?: string;
  stream_url?: string;
}

export type ClassificationType =
  | "REAL_VIDEO"
  | "STATIC_IMAGE"
  | "IMAGE_ZOOM"
  | "IMAGE_ZOOM_IN"
  | "IMAGE_ZOOM_OUT"
  | "IMAGE_PAN"
  | "IMAGE_SLIDE"
  | "SIMPLE_BACKGROUND"
  | "IMAGE_ON_BACKGROUND"
  | "TRANSITION"
  | "SHORT_UNUSABLE"
  | "UNCERTAIN";

export interface Segment {
  id: string;
  start: number;
  end: number;
  duration: number;
  rep_time: number;
  classification: ClassificationType;
  confidence: number;
  confidence_percent: number;
  action: "KEEP" | "REMOVE" | "UNCERTAIN";
  user_override: "KEEP" | "REMOVE" | null;
  reason: string;
  metrics?: {
    ssim?: number;
    noise?: number;
    motion_score?: number;
    local_motion?: number;
    zoom_scale?: number;
    affine_residual?: number;
  };
}

export interface AnalysisSettings {
  sensitivity: "Conservative" | "Medium" | "Aggressive";
  min_clip_duration: number;
  min_clip_gap: number;
  detect_static: boolean;
  detect_zoom_pan: boolean;
  detect_transitions: boolean;
  detect_background: boolean;
  detect_repeated: boolean;
  detect_motion: boolean;
  ai_assisted: boolean;
}

export interface ExportSettings {
  export_combined: boolean;
  export_individual: boolean;
  quality: "Original" | "High" | "Medium";
  include_audio: boolean;
  codec: string;
  padding_sec: number;
  output_dir?: string;
}

export interface ProgressData {
  stage: string;
  percent: number;
  timestamp: number;
  total_duration: number;
  scenes_detected: number;
  likely_images: number;
  likely_usable: number;
}

export interface ExportProgressData {
  stage: string;
  percent: number;
  current_clip?: number;
  total_clips?: number;
}

export interface ExportResult {
  status: string;
  output_dir?: string;
  project_dir?: string;
  combined_video?: {
    filename: string;
    filepath: string;
    relative_path: string;
    size_mb: number;
  };
  individual_clips?: Array<{
    clip_index: number;
    filename: string;
    filepath: string;
    relative_path: string;
    start: number;
    end: number;
    duration: number;
    size_mb: number;
  }>;
  zip_file?: {
    filename: string;
    filepath: string;
    relative_path: string;
    size_mb: number;
  };
  analysis_json?: string;
  surviving_clips_count?: number;
  message?: string;
}

export interface TestVideoItem {
  name: string;
  filename: string;
  filepath: string;
  metadata: VideoMetadata;
}

// ─── Electron IPC bridge types (window.electronAPI) ───────────────────────────
export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  releaseNotes?: string;
  releaseName?: string;
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getApiPort: () => Promise<number>;
      openDirectory: (dirPath: string) => Promise<void>;
      openFile: (filePath: string) => Promise<boolean>;
      showItemInFolder: (filePath: string) => Promise<boolean>;
      getDefaultDownloadsDir: () => Promise<string>;
      openLogsFolder: () => Promise<void>;
      selectDirectory: () => Promise<string | null>;
      checkForUpdates: () => Promise<{ checking: boolean; currentVersion: string; error?: string; message?: string }>;
      installUpdate: () => Promise<void>;
      openDashboard: () => Promise<void>;
      onVideoDropped: (callback: (filePath: string) => void) => void;
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
      onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void) => void;
      onUpdateReady: (callback: (info: { version: string; releaseName?: string; releaseNotes?: string }) => void) => void;
    };
  }
}
