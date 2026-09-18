import React, { useState, useRef } from "react";
import {
  Layers,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Trash2,
  Folder,
  RefreshCw,
  Sliders,
  CheckSquare,
  Zap,
  Film,
  Download,
  Eye,
  AlertCircle
} from "lucide-react";
import { VideoMetadata, Segment } from "../types/video";

export interface BatchItem {
  id: string;
  metadata: VideoMetadata;
  status: "waiting" | "analyzing" | "completed" | "exporting" | "exported" | "error";
  progress: number;
  stage?: string;
  error?: string;
  outputPath?: string;
  segments?: Segment[];
  stats?: {
    totalScenes: number;
    usableClips: number;
    removedSlides: number;
  };
}

interface BatchQueueProps {
  batchItems: BatchItem[];
  setBatchItems: React.Dispatch<React.SetStateAction<BatchItem[]>>;
  onStartBatch: () => void;
  onPauseBatch: () => void;
  isProcessingBatch: boolean;
  onAddFiles: (files: FileList | File[]) => void;
  autoExport: boolean;
  setAutoExport: (val: boolean) => void;
  onReviewInWorkspace: (item: BatchItem) => void;
  onExportItem: (item: BatchItem) => void;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({
  batchItems,
  setBatchItems,
  onStartBatch,
  onPauseBatch,
  isProcessingBatch,
  onAddFiles,
  autoExport,
  setAutoExport,
  onReviewInWorkspace,
  onExportItem,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const removeItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCompleted = () => {
    setBatchItems((prev) => prev.filter((item) => item.status !== "completed" && item.status !== "exported"));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  // Aggregated Stats
  const totalCount = batchItems.length;
  const completedCount = batchItems.filter((i) => i.status === "completed" || i.status === "exported").length;
  const inProgressCount = batchItems.filter((i) => i.status === "analyzing" || i.status === "exporting").length;
  const waitingCount = batchItems.filter((i) => i.status === "waiting").length;
  const totalUsableClips = batchItems.reduce((acc, curr) => acc + (curr.stats?.usableClips || 0), 0);
  const totalRemovedSlides = batchItems.reduce((acc, curr) => acc + (curr.stats?.removedSlides || 0), 0);

  return (
    <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "rgba(212, 175, 55, 0.12)",
              border: "1px solid rgba(212, 175, 55, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Layers size={24} color="#D4AF37" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 style={{ fontSize: "20px", fontWeight: "700" }}>Autopilot Batch Queue</h3>
              <span className="badge" style={{ background: "rgba(212, 175, 55, 0.15)", color: "#F3D079", fontSize: "11px" }}>
                High-Speed Turbo
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Queue multiple videos to autonomously analyze & extract clean video clips under 5 minutes each
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp4,.mov,.mkv,.webm,.avi"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onAddFiles(e.target.files);
              }
            }}
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Plus size={16} /> Add Videos
          </button>

          {completedCount > 0 && !isProcessingBatch && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={clearCompleted}
              style={{ fontSize: "12px" }}
            >
              Clear Completed
            </button>
          )}

          {isProcessingBatch ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onPauseBatch}
              style={{ display: "flex", alignItems: "center", gap: "8px", borderColor: "#F59E0B", color: "#F59E0B" }}
            >
              <Pause size={16} /> Pause Queue
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStartBatch}
              disabled={waitingCount === 0}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Play size={16} fill="#0A0A0C" color="#0A0A0C" />
              {waitingCount > 0 ? `Start Autopilot (${waitingCount} Queued)` : "All Completed"}
            </button>
          )}
        </div>
      </div>

      {/* Autopilot Control Banner */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Zap size={18} color="#D4AF37" />
          <div>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#F1F5F9" }}>
              Autopilot Export Clean Master Video
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Immediately exports surviving high-quality clean video upon analysis completion to your output folder
            </div>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: "13px", color: autoExport ? "#10B981" : "var(--text-muted)", fontWeight: "600" }}>
            {autoExport ? "Auto-Export Enabled" : "Manual Export Only"}
          </span>
          <input
            type="checkbox"
            checked={autoExport}
            onChange={(e) => setAutoExport(e.target.checked)}
            style={{ width: "18px", height: "18px", accentColor: "#D4AF37", cursor: "pointer" }}
          />
        </label>
      </div>

      {/* Overview Statistics Strip */}
      {totalCount > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Queued</div>
            <div style={{ fontSize: "20px", fontWeight: "700", marginTop: "2px" }}>{totalCount}</div>
          </div>
          <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Completed</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#10B981", marginTop: "2px" }}>{completedCount}</div>
          </div>
          <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Usable Clips Preserved</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#38BDF8", marginTop: "2px" }}>{totalUsableClips}</div>
          </div>
          <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Still Slides Removed</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#EF4444", marginTop: "2px" }}>{totalRemovedSlides}</div>
          </div>
        </div>
      )}

      {/* Queue items list or Drag & Drop empty state */}
      {batchItems.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            textAlign: "center",
            padding: "56px 24px",
            color: "var(--text-muted)",
            border: isDragOver ? "2px dashed #D4AF37" : "2px dashed var(--border-subtle)",
            borderRadius: "14px",
            cursor: "pointer",
            background: isDragOver ? "rgba(212, 175, 55, 0.05)" : "rgba(0,0,0,0.15)",
            transition: "all 0.2s ease",
          }}
        >
          <Layers size={42} style={{ margin: "0 auto 16px", opacity: 0.6, color: isDragOver ? "#D4AF37" : "inherit" }} />
          <p style={{ fontSize: "16px", fontWeight: "600", color: "#F1F5F9" }}>
            Drop multiple video files here or click to browse
          </p>
          <p style={{ fontSize: "13px", marginTop: "6px", color: "var(--text-secondary)" }}>
            MP4, MOV, MKV, WEBM, AVI supported • Videos analyze sequentially on autopilot
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {batchItems.map((item, idx) => {
            const isCompleted = item.status === "completed" || item.status === "exported";
            const isAnalyzing = item.status === "analyzing";
            const isExporting = item.status === "exporting";
            const isError = item.status === "error";

            return (
              <div
                key={item.id}
                style={{
                  background: isAnalyzing || isExporting ? "rgba(212, 175, 55, 0.06)" : "rgba(0, 0, 0, 0.3)",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: isAnalyzing || isExporting ? "1px solid rgba(212, 175, 55, 0.4)" : "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  transition: "border 0.2s ease",
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <span className="mono" style={{ fontSize: "14px", color: "#F3D079", fontWeight: "700" }}>
                      #{idx + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: "700", color: "#F8FAFC" }}>
                        {item.metadata.filename}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {item.metadata.resolution} • {item.metadata.fps} FPS • {item.metadata.duration.toFixed(1)}s • {item.metadata.file_size_mb} MB
                      </div>
                    </div>
                  </div>

                  {/* Badges & Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span
                      className={`badge ${
                        isCompleted
                          ? "badge-keep"
                          : isAnalyzing || isExporting
                          ? "badge-uncertain"
                          : isError
                          ? "badge-remove"
                          : "badge-neutral"
                      }`}
                      style={{ padding: "4px 10px", fontSize: "12px" }}
                    >
                      {isCompleted && <CheckCircle2 size={13} />}
                      {(isAnalyzing || isExporting) && <RefreshCw size={13} className="animate-spin" />}
                      {item.status === "waiting" && <Clock size={13} />}
                      {isError && <AlertCircle size={13} />}
                      {item.status.toUpperCase()}
                    </span>

                    {/* Review In Workspace Button */}
                    {isCompleted && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onReviewInWorkspace(item)}
                        style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px" }}
                        title="Open this video and its detected segments in the Studio Workspace"
                      >
                        <Eye size={14} color="#38BDF8" /> Review in Workspace
                      </button>
                    )}

                    {/* Export Button if not auto-exported */}
                    {isCompleted && item.status !== "exported" && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onExportItem(item)}
                        style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px" }}
                        title="Export clean clips or merged video"
                      >
                        <Download size={14} color="#10B981" /> Export Video
                      </button>
                    )}

                    {/* Remove Item */}
                    {!isProcessingBatch && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "6px 10px" }}
                        onClick={() => removeItem(item.id)}
                        title="Remove from Queue"
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Stage Text */}
                {(isAnalyzing || isExporting) && item.stage && (
                  <div style={{ fontSize: "12px", color: "#F3D079", display: "flex", alignItems: "center", gap: "6px" }}>
                    <RefreshCw size={12} className="animate-spin" /> {item.stage} ({Math.round(item.progress)}%)
                  </div>
                )}

                {/* Error Banner */}
                {isError && item.error && (
                  <div style={{ fontSize: "12px", color: "#EF4444", background: "rgba(239, 68, 68, 0.1)", padding: "8px 12px", borderRadius: "6px" }}>
                    {item.error}
                  </div>
                )}

                {/* Completed Summary Banner */}
                {isCompleted && item.stats && (
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      fontSize: "12px",
                      color: "#A7F3D0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <strong>Analysis Complete:</strong> {item.stats.usableClips} usable real video clips preserved • {item.stats.removedSlides} image/static slides removed across {item.stats.totalScenes} scenes
                    </div>
                    {item.outputPath && (
                      <div style={{ color: "#F3D079" }}>
                        ✓ Exported clean master video
                      </div>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                <div style={{ width: "100%", height: "6px", background: "#1E293B", borderRadius: "9999px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${item.progress}%`,
                      height: "100%",
                      background: isCompleted ? "#10B981" : isError ? "#EF4444" : "var(--accent-gradient)",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
