import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, FileVideo, Clock, Monitor, Activity, HardDrive, CheckCircle2, RefreshCw, Play } from "lucide-react";
import { VideoMetadata, TestVideoItem } from "../types/video";
import { getApiEndpoint } from "../config/api";

interface UploadZoneProps {
  metadata: VideoMetadata | null;
  onVideoSelected: (meta: VideoMetadata) => void;
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  metadata,
  onVideoSelected,
  isUploading,
  setIsUploading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [testVideos, setTestVideos] = useState<TestVideoItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available test videos
  useEffect(() => {
    fetch(getApiEndpoint("/api/test-videos"))
      .then((res) => res.json())
      .then((data) => {
        if (data.test_videos) {
          setTestVideos(data.test_videos);
        }
      })
      .catch((err) => console.warn("Could not fetch test videos:", err));
  }, []);

  const handleFile = async (file: File) => {
    setUploadError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExtensions = ["mp4", "mov", "mkv", "webm", "avi"];

    if (!ext || !validExtensions.includes(ext)) {
      setUploadError(`Unsupported format .${ext}. Please select MP4, MOV, MKV, WEBM, or AVI.`);
      return;
    }

    setIsUploading(true);

    try {
      const filePath = (file as any).path;
      // In Electron desktop mode, load local file directly in 0.02s without copying multi-hundred MB files
      if (filePath && typeof filePath === "string") {
        const res = await fetch(getApiEndpoint("/api/load-local"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filepath: filePath }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Failed to load local video");
        }
        onVideoSelected(data.metadata);
        return;
      }

      // Browser fallback: standard multipart upload
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(getApiEndpoint("/api/upload"), {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to upload video");
      }

      onVideoSelected(data.metadata);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Drag & Drop Card */}
      <div
        className="glass-panel"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragOver ? "2px dashed #D4AF37" : "2px dashed rgba(212, 175, 55, 0.22)",
          background: isDragOver ? "rgba(212, 175, 55, 0.08)" : "var(--bg-card)",
          padding: "48px 32px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.mkv,.webm,.avi"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: "rgba(212, 175, 55, 0.14)",
              border: "1px solid rgba(212, 175, 55, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 30px rgba(212, 175, 55, 0.25)",
            }}
          >
            {isUploading ? (
              <RefreshCw size={32} color="#D4AF37" className="animate-spin" />
            ) : (
              <UploadCloud size={36} color="#D4AF37" />
            )}
          </div>

          <div>
            <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "6px" }}>
              {isUploading ? "Uploading & Inspecting Video..." : "Drop your video here"}
            </h3>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Drag and drop any finished video or click to choose file
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <FileVideo size={16} /> Choose Video
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "10px" }}>
            {["MP4", "MOV", "MKV", "WEBM", "AVI"].map((ext) => (
              <span key={ext} className="badge badge-neutral" style={{ fontSize: "11px" }}>
                {ext}
              </span>
            ))}
          </div>

          {uploadError && (
            <div style={{ marginTop: "12px", color: "#EF4444", fontSize: "13px", fontWeight: "600" }}>
              {uploadError}
            </div>
          )}
        </div>
      </div>

      {/* Video Metadata Card (when video loaded) */}
      {metadata && (
        <div className="glass-panel" style={{ padding: "20px 24px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={20} color="#10B981" />
              </div>
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: "700", wordBreak: "break-all" }}>{metadata.filename}</h4>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Video ready for analysis</span>
              </div>
            </div>
            <span className="badge badge-keep">
              Loaded
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Clock size={12} /> Duration
              </span>
              <p style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px" }}>{formatDuration(metadata.duration)}</p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Monitor size={12} /> Resolution
              </span>
              <p style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px" }}>{metadata.resolution}</p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Activity size={12} /> Framerate
              </span>
              <p style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px" }}>{metadata.fps} FPS</p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <HardDrive size={12} /> File Size
              </span>
              <p style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px" }}>{metadata.file_size_mb} MB</p>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 14px", borderRadius: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Codec</span>
              <p style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px", textTransform: "uppercase" }}>{metadata.codec_name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Preloaded Test Assets Selector */}
      {testVideos.length > 0 && (
        <div className="glass-panel" style={{ padding: "18px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Instant Test Bench (Pre-Synthesized Cases A–F)
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              One-click instant analysis testing
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
            {testVideos.map((tv) => (
              <button
                key={tv.filename}
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: "10px 14px",
                  justifyContent: "flex-start",
                  textAlign: "left",
                  background: metadata?.filename === tv.filename ? "rgba(212, 175, 55, 0.18)" : "rgba(16, 16, 22, 0.6)",
                  borderColor: metadata?.filename === tv.filename ? "#D4AF37" : "var(--border-subtle)",
                }}
                onClick={() => onVideoSelected(tv.metadata)}
              >
                <Play size={14} color="#D4AF37" />
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
                    {tv.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {formatDuration(tv.metadata.duration)} • {tv.metadata.file_size_mb} MB
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
