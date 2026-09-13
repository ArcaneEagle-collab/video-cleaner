import React, { useState } from "react";
import { Layers, Plus, Play, CheckCircle2, Clock, Trash2, Folder, RefreshCw } from "lucide-react";
import { VideoMetadata } from "../types/video";

export interface BatchItem {
  id: string;
  metadata: VideoMetadata;
  status: "waiting" | "analyzing" | "completed" | "error";
  progress: number;
  error?: string;
  outputPath?: string;
}

interface BatchQueueProps {
  batchItems: BatchItem[];
  setBatchItems: React.Dispatch<React.SetStateAction<BatchItem[]>>;
  onStartBatch: () => void;
  isProcessingBatch: boolean;
  onAddFiles: (files: FileList) => void;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({
  batchItems,
  setBatchItems,
  onStartBatch,
  isProcessingBatch,
  onAddFiles,
}) => {
  const removeItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Layers size={22} color="#D4AF37" />
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Batch Processing Queue</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Analyze and clean multiple video files autonomously
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
            <Plus size={16} /> Add Videos to Queue
            <input
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
          </label>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onStartBatch}
            disabled={isProcessingBatch || batchItems.length === 0}
          >
            {isProcessingBatch ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Processing Queue...
              </>
            ) : (
              <>
                <Play size={16} fill="#0A0A0C" color="#0A0A0C" /> Start Batch Cleaning
              </>
            )}
          </button>
        </div>
      </div>

      {/* Queue items list */}
      {batchItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)", border: "2px dashed var(--border-subtle)", borderRadius: "10px" }}>
          <Layers size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
          <p style={{ fontSize: "14px", fontWeight: "600" }}>Your batch queue is empty</p>
          <p style={{ fontSize: "12px", marginTop: "4px" }}>Click "Add Videos to Queue" to process multiple clips in sequence</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {batchItems.map((item, idx) => (
            <div
              key={item.id}
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                padding: "16px 20px",
                borderRadius: "10px",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="mono" style={{ fontSize: "13px", color: "#F3D079", fontWeight: "700" }}>#{idx + 1}</span>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "700" }}>{item.metadata.filename}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {item.metadata.resolution} • {item.metadata.fps} FPS • {item.metadata.file_size_mb} MB
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span
                    className={`badge ${
                      item.status === "completed"
                        ? "badge-keep"
                        : item.status === "analyzing"
                        ? "badge-uncertain"
                        : "badge-neutral"
                    }`}
                  >
                    {item.status === "completed" && <CheckCircle2 size={12} />}
                    {item.status === "analyzing" && <RefreshCw size={12} className="animate-spin" />}
                    {item.status === "waiting" && <Clock size={12} />}
                    {item.status.toUpperCase()}
                  </span>

                  {!isProcessingBatch && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "6px" }}
                      onClick={() => removeItem(item.id)}
                      title="Remove from Queue"
                    >
                      <Trash2 size={14} color="#EF4444" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ width: "100%", height: "6px", background: "#1E293B", borderRadius: "9999px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${item.progress}%`,
                    height: "100%",
                    background: item.status === "completed" ? "#10B981" : "var(--accent-gradient)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
