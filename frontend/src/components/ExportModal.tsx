import React, { useState } from "react";
import { Download, X, Film, CheckCircle2, RefreshCw, Folder, FileVideo } from "lucide-react";
import { ExportSettings, ExportResult } from "../types/video";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportSettings: ExportSettings;
  setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
  onExport: () => void;
  isExporting: boolean;
  exportResult: ExportResult | null;
  keptClipsCount: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  exportSettings,
  setExportSettings,
  onExport,
  isExporting,
  exportResult,
  keptClipsCount,
}) => {
  if (!isOpen) return null;

  const update = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    setExportSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "640px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          background: "#0D0D11",
          border: "1px solid rgba(212, 175, 55, 0.28)",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(212, 175, 55, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Download size={22} color="#D4AF37" />
            <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Export Cleaned Footage</h3>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px", borderRadius: "50%" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* If export complete, show download links and output summary */}
        {exportResult && exportResult.status === "success" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", alignItems: "center", gap: "12px" }}>
              <CheckCircle2 size={24} color="#10B981" />
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: "700", color: "#10B981" }}>Export Completed Successfully!</h4>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Extracted {exportResult.surviving_clips_count} usable video clips locally without cloud dependency.
                </p>
              </div>
            </div>

            {/* Combined Clean Video Link */}
            {exportResult.combined_video && (
              <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <FileVideo size={20} color="#D4AF37" />
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "700" }}>{exportResult.combined_video.filename}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Combined Master Video • {exportResult.combined_video.size_mb} MB</div>
                  </div>
                </div>
                <a
                  href={`http://127.0.0.1:8000/api/stream/${exportResult.combined_video.filename}`}
                  download={exportResult.combined_video.filename}
                  className="btn btn-primary"
                  style={{ padding: "6px 14px", fontSize: "12px" }}
                >
                  <Download size={14} /> Download
                </a>
              </div>
            )}

            {/* Individual Clips List */}
            {exportResult.individual_clips && exportResult.individual_clips.length > 0 && (
              <div>
                <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px", display: "block" }}>
                  Individual Extracted Clips ({exportResult.individual_clips.length})
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                  {exportResult.individual_clips.map((c) => (
                    <div
                      key={c.filename}
                      style={{
                        background: "rgba(0, 0, 0, 0.2)",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "12px",
                      }}
                    >
                      <span className="mono" style={{ fontWeight: "600" }}>{c.filename}</span>
                      <span style={{ color: "var(--text-muted)" }}>{c.duration.toFixed(1)}s • {c.size_mb} MB</span>
                      <a
                        href={`http://127.0.0.1:8000/api/stream/${c.filename}`}
                        download={c.filename}
                        className="btn btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "11px" }}
                      >
                        <Download size={12} /> Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
              <Folder size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
              Saved locally to: <span className="mono" style={{ color: "var(--text-primary)" }}>{exportResult.project_dir}</span>
            </div>

            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ alignSelf: "flex-end" }}>
              Close
            </button>
          </div>
        ) : (
          /* Export Form Options */
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ background: "rgba(212, 175, 55, 0.12)", padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(212, 175, 55, 0.3)", fontSize: "13px" }}>
              Ready to export <span style={{ fontWeight: "700", color: "#F3D079" }}>{keptClipsCount} surviving clip sections</span> without editorial image slideshows.
            </div>

            {/* Quality Preset */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
                Export Quality
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {(["Original", "High", "Medium"] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="btn"
                    onClick={() => update("quality", q)}
                    style={{
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: exportSettings.quality === q ? "var(--accent-gradient)" : "rgba(24, 24, 30, 0.8)",
                      color: exportSettings.quality === q ? "#0A0A0C" : "var(--text-secondary)",
                      border: exportSettings.quality === q ? "1px solid rgba(255, 238, 170, 0.4)" : "1px solid var(--border-subtle)",
                      fontWeight: exportSettings.quality === q ? "700" : "500",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Padding */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Padding around surviving clips
                </label>
                <span className="mono" style={{ fontSize: "13px", fontWeight: "700", color: "#F3D079" }}>
                  ±{exportSettings.padding_sec.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.1"
                value={exportSettings.padding_sec}
                onChange={(e) => update("padding_sec", parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#D4AF37", cursor: "pointer" }}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Boundary-protected: automatically isolates cuts from removed slideshows with zero image bleeding.
              </span>
            </div>

            {/* Checkboxes: Export Modes */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(0, 0, 0, 0.2)", padding: "14px", borderRadius: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={exportSettings.export_combined}
                  onChange={(e) => update("export_combined", e.target.checked)}
                  style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
                />
                <span>Export combined video (<span className="mono" style={{ color: "#F3D079" }}>originalname_clean.mp4</span>)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={exportSettings.export_individual}
                  onChange={(e) => update("export_individual", e.target.checked)}
                  style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
                />
                <span>Export individual clips (<span className="mono" style={{ color: "#F3D079" }}>clip_001.mp4, clip_002.mp4...</span>)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={exportSettings.include_audio}
                  onChange={(e) => update("include_audio", e.target.checked)}
                  style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
                />
                <span>Keep original synchronized audio tracks</span>
              </label>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isExporting}>
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onExport}
                disabled={isExporting || keptClipsCount === 0}
                style={{ padding: "10px 24px" }}
              >
                {isExporting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Trimming & Merging...
                  </>
                ) : (
                  <>
                    <Download size={16} /> Start Clip Extraction
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
