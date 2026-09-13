import React, { useState, useEffect } from "react";
import { Download, X, CheckCircle2, RefreshCw, Folder, FileVideo, AlertCircle, FolderOpen, Play } from "lucide-react";
import { ExportSettings, ExportResult, ExportProgressData } from "../types/video";
import { getApiEndpoint } from "../config/api";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportSettings: ExportSettings;
  setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
  onExport: () => void;
  isExporting: boolean;
  exportProgress: ExportProgressData | null;
  exportResult: ExportResult | null;
  setExportResult: React.Dispatch<React.SetStateAction<ExportResult | null>>;
  keptClipsCount: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  exportSettings,
  setExportSettings,
  onExport,
  isExporting,
  exportProgress,
  exportResult,
  setExportResult,
  keptClipsCount,
}) => {
  const [defaultDirResolved, setDefaultDirResolved] = useState(false);

  // Initialize default output folder to Downloads if not already specified
  useEffect(() => {
    if (!isOpen || defaultDirResolved || exportSettings.output_dir) return;

    const resolveDefaultDir = async () => {
      try {
        if (window.electronAPI?.getDefaultDownloadsDir) {
          const dl = await window.electronAPI.getDefaultDownloadsDir();
          if (dl) {
            setExportSettings((prev) => ({ ...prev, output_dir: dl }));
            setDefaultDirResolved(true);
            return;
          }
        }
        // Fallback: fetch system settings from backend
        const res = await fetch(getApiEndpoint("/api/settings"));
        const data = await res.json();
        if (data && data.output_dir) {
          setExportSettings((prev) => ({ ...prev, output_dir: data.output_dir }));
        }
      } catch (err) {
        console.warn("Could not resolve default download folder:", err);
      } finally {
        setDefaultDirResolved(true);
      }
    };

    resolveDefaultDir();
  }, [isOpen, defaultDirResolved, exportSettings.output_dir, setExportSettings]);

  if (!isOpen) return null;

  const update = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    setExportSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectOutputDir = async () => {
    if (window.electronAPI?.selectDirectory) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        update("output_dir", selected);
      }
    } else {
      const current = exportSettings.output_dir || "";
      const manual = prompt("Enter output destination folder path:", current);
      if (manual && manual.trim()) {
        update("output_dir", manual.trim());
      }
    }
  };

  const handleOpenFolder = (dirPath?: string) => {
    const target = dirPath || exportResult?.output_dir || exportResult?.project_dir || exportSettings.output_dir;
    if (target && window.electronAPI?.openDirectory) {
      window.electronAPI.openDirectory(target);
    } else if (target) {
      alert("Saved folder: " + target);
    }
  };

  const handleOpenFile = (filePath?: string) => {
    if (filePath && window.electronAPI?.openFile) {
      window.electronAPI.openFile(filePath);
    } else if (filePath && window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(filePath);
    } else if (filePath) {
      alert("File location: " + filePath);
    }
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
      onClick={() => {
        if (!isExporting) onClose();
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "660px",
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
          {!isExporting && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "6px", borderRadius: "50%" }}
              onClick={onClose}
              title="Close modal"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 1. If currently exporting: show live progress */}
        {isExporting ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "16px 0" }}>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  background: "rgba(212, 175, 55, 0.15)",
                  border: "1px solid rgba(212, 175, 55, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 25px rgba(212, 175, 55, 0.25)",
                }}
              >
                <RefreshCw size={28} color="#D4AF37" className="animate-spin" />
              </div>
              <h4 style={{ fontSize: "17px", fontWeight: "700", color: "#F3D079" }}>
                {exportProgress?.stage || "Trimming & Merging usable footage..."}
              </h4>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "450px" }}>
                Extracting {keptClipsCount} surviving video clips and assembling master video locally without cloud dependency.
              </p>
            </div>

            {/* Progress Bar */}
            <div style={{ width: "100%", background: "rgba(255, 255, 255, 0.08)", borderRadius: "8px", height: "12px", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
              <div
                style={{
                  width: `${Math.max(5, exportProgress?.percent || 10)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #D4AF37 0%, #F5D77F 100%)",
                  borderRadius: "8px",
                  transition: "width 0.3s ease",
                  boxShadow: "0 0 12px rgba(212, 175, 55, 0.6)",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)" }}>
              <span>
                {exportProgress?.current_clip && exportProgress?.total_clips
                  ? `Processing clip ${exportProgress.current_clip} of ${exportProgress.total_clips}`
                  : "Processing video cuts..."}
              </span>
              <span className="mono" style={{ fontWeight: "700", color: "#F3D079" }}>
                {Math.round(exportProgress?.percent || 10)}%
              </span>
            </div>

            <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
              <Folder size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
              Saving to: <span className="mono" style={{ color: "var(--text-primary)" }}>{exportSettings.output_dir || "Downloads"}</span>
            </div>
          </div>
        ) : exportResult && exportResult.status === "error" ? (
          /* 2. If export failed: show descriptive error banner */
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.35)", display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <AlertCircle size={24} color="#EF4444" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: "700", color: "#EF4444" }}>Export Failed</h4>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {exportResult.message || "An unexpected error occurred during clip trimming or merging."}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setExportResult(null)}
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </div>
          </div>
        ) : exportResult && exportResult.status === "success" ? (
          /* 3. If export complete: show download links, file locations, and open buttons */
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", alignItems: "center", gap: "12px" }}>
              <CheckCircle2 size={24} color="#10B981" />
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: "700", color: "#10B981" }}>Export Completed Successfully!</h4>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Extracted {exportResult.surviving_clips_count ?? keptClipsCount} usable video clips locally without cloud dependency.
                </p>
              </div>
            </div>

            {/* Combined Clean Video Card */}
            {exportResult.combined_video && (
              <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <FileVideo size={24} color="#D4AF37" />
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#F8FAFC" }}>{exportResult.combined_video.filename}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Combined Master Video • {exportResult.combined_video.size_mb} MB</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {exportResult.combined_video.filepath && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                        onClick={() => handleOpenFile(exportResult.combined_video?.filepath)}
                        title="Play video with default player"
                      >
                        <Play size={13} /> Play Video
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "6px 14px", fontSize: "12px" }}
                        onClick={() => handleOpenFile(exportResult.combined_video?.filepath)}
                        title="Show video in Downloads folder"
                      >
                        <FolderOpen size={13} /> Show in Folder
                      </button>
                    </>
                  )}

                  <a
                    href={getApiEndpoint(`/api/stream/${exportResult.combined_video.filename}`)}
                    download={exportResult.combined_video.filename}
                    className="btn btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "12px" }}
                    title="Download / Save copy"
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
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
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => handleOpenFile(c.filepath)}
                          title="Open clip"
                        >
                          <Play size={11} /> Play
                        </button>
                        <a
                          href={getApiEndpoint(`/api/stream/${c.filename}`)}
                          download={c.filename}
                          className="btn btn-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                          <Download size={11} /> Save
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Output Path Notice */}
            <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "12px 16px", borderRadius: "8px", fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <Folder size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
                Saved directly to: <span className="mono" style={{ color: "#F3D079", fontWeight: "600" }}>{exportResult.output_dir || exportResult.project_dir}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: "11px" }}
                onClick={() => handleOpenFolder(exportResult.output_dir || exportResult.project_dir)}
              >
                <FolderOpen size={12} /> Open Folder
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setExportResult(null)}
              >
                Export Settings
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* 4. Export Form Options */
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ background: "rgba(212, 175, 55, 0.12)", padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(212, 175, 55, 0.3)", fontSize: "13px" }}>
              Ready to export <span style={{ fontWeight: "700", color: "#F3D079" }}>{keptClipsCount} surviving clip sections</span> without editorial image slideshows.
            </div>

            {/* Destination Folder Selector */}
            <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Folder size={16} color="#D4AF37" /> Export Destination
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                  onClick={handleSelectOutputDir}
                >
                  <FolderOpen size={13} /> Change Folder...
                </button>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: "12px",
                  color: "#F3D079",
                  background: "rgba(0, 0, 0, 0.35)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  wordBreak: "break-all",
                  border: "1px solid rgba(212, 175, 55, 0.15)",
                }}
              >
                {exportSettings.output_dir || "Downloads (default)"}
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "6px" }}>
                By default, the master video and clips are exported directly to your Downloads folder.
              </span>
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
                <Download size={16} /> Start Clip Extraction
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
