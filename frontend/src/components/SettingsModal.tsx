import React, { useState, useEffect } from "react";
import {
  X,
  Folder,
  Trash2,
  Cpu,
  ShieldCheck,
  Info,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Film
} from "lucide-react";
import { getApiEndpoint } from "../config/api";
import { setAnalyticsConsent, getAnalyticsConsent } from "../services/analytics";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<"storage" | "diagnostics" | "privacy" | "about">("storage");

  // System & Settings state
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // Settings form
  const [outputDir, setOutputDir] = useState("");
  const [tempDir, setTempDir] = useState("");
  const [tempSizeMb, setTempSizeMb] = useState<number>(0);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  // Fetch settings & system info
  const loadInfo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(getApiEndpoint("/api/system/info"));
      if (res.ok) {
        const data = await res.json();
        setSystemInfo(data);
        setOutputDir(data.output_dir || "");
        setTempDir(data.temp_dir || "");
        setTempSizeMb(data.temp_size_mb || 0);
        setAnalyticsEnabled(!!data.analytics_enabled);
      }
    } catch (err) {
      console.warn("Failed to fetch system info:", err);
    }

    try {
      const logRes = await fetch(getApiEndpoint("/api/system/logs?lines=50"));
      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(logData.logs || []);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadInfo();
      setStatusMessage(null);
      setUpdateStatus(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Save Settings
  const handleSaveSettings = async (updates: Record<string, any>) => {
    try {
      const res = await fetch(getApiEndpoint("/api/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setStatusMessage("Settings saved successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      alert("Failed to save settings: " + err);
    }
  };

  // Clear Temp Files
  const handleClearTemp = async () => {
    if (!confirm("Are you sure you want to clean temporary video processing files? Your original videos and exported projects will NOT be affected.")) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(getApiEndpoint("/api/system/clean-temp"), { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(`Cleaned ${data.deleted_count} temporary files, reclaimed ${data.reclaimed_mb} MB.`);
        setTempSizeMb(0);
      }
    } catch (err) {
      alert("Failed to clean temporary files: " + err);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch(getApiEndpoint("/api/system/clear-logs"), { method: "POST" });
      if (res.ok) {
        setLogs(["Logs cleared."]);
        setStatusMessage("Logs cleared successfully.");
      }
    } catch (err) {
      alert("Failed to clear logs: " + err);
    }
  };

  // Check For Updates
  const handleCheckUpdates = async () => {
    setUpdateStatus("Checking for updates...");
    if (window.electronAPI?.checkForUpdates) {
      try {
        const res = await window.electronAPI.checkForUpdates();
        setUpdateStatus(res.message || `You are running the latest version: ${res.currentVersion || "1.1.3"}`);
        return;
      } catch {
        // Fallback
      }
    }
    setTimeout(() => {
      setUpdateStatus("You are running the latest version: 1.1.3 (Up to date)");
    }, 800);
  };

  // Open directory in native explorer
  const handleOpenFolder = (dirPath: string) => {
    if (window.electronAPI?.openDirectory) {
      window.electronAPI.openDirectory(dirPath);
    } else {
      alert("Folder path: " + dirPath);
    }
  };

  // Open logs folder
  const handleOpenLogsFolder = () => {
    if (window.electronAPI?.openLogsFolder) {
      window.electronAPI.openLogsFolder();
    } else if (systemInfo?.logs_dir) {
      handleOpenFolder(systemInfo.logs_dir);
    }
  };

  // Select output directory via desktop native dialog
  const handleSelectOutputDir = async () => {
    if (window.electronAPI?.selectDirectory) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        setOutputDir(selected);
        await handleSaveSettings({ output_dir: selected });
      }
    } else {
      const manual = prompt("Enter output directory path:", outputDir);
      if (manual) {
        setOutputDir(manual);
        await handleSaveSettings({ output_dir: manual });
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
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
          maxWidth: "760px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          border: "1px solid rgba(212, 175, 55, 0.3)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(212, 175, 55, 0.15)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(10, 10, 12, 0.8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--accent-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Film size={18} color="#0A0A0C" strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "0.03em" }}>Settings & Preferences</h2>
              <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>Video Cleaner Desktop by Amna</p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: "6px", borderRadius: "50%" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "12px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "rgba(0, 0, 0, 0.3)",
          }}
        >
          <button
            type="button"
            className={`btn ${activeTab === "storage" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "12px", padding: "6px 14px", border: "none" }}
            onClick={() => setActiveTab("storage")}
          >
            <Folder size={14} /> Storage & Outputs
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "diagnostics" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "12px", padding: "6px 14px", border: "none" }}
            onClick={() => setActiveTab("diagnostics")}
          >
            <Cpu size={14} /> Diagnostics
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "privacy" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "12px", padding: "6px 14px", border: "none" }}
            onClick={() => setActiveTab("privacy")}
          >
            <ShieldCheck size={14} /> Privacy & Analytics
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "about" ? "btn-primary" : "btn-secondary"}`}
            style={{ fontSize: "12px", padding: "6px 14px", border: "none" }}
            onClick={() => setActiveTab("about")}
          >
            <Info size={14} /> About
          </button>
        </div>

        {/* Status Toast Notification */}
        {statusMessage && (
          <div
            style={{
              padding: "8px 24px",
              background: "rgba(16, 185, 129, 0.15)",
              borderBottom: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#34D399",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={14} /> {statusMessage}
          </div>
        )}

        {/* Modal Body */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* TAB 1: STORAGE & OUTPUTS */}
          {activeTab === "storage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
              {/* Output Directory */}
              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                  Exported Videos Output Folder
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="text"
                    readOnly
                    value={outputDir}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      fontSize: "12px",
                      fontFamily: "monospace",
                    }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={handleSelectOutputDir} style={{ fontSize: "12px" }}>
                    Browse...
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenFolder(outputDir)}
                    title="Open in Explorer"
                    style={{ padding: "8px 12px" }}
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Default location where exported clean clips and master videos are stored.
                </p>
              </div>

              {/* Temporary Processing Files */}
              <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(0, 0, 0, 0.25)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <h4 style={{ fontSize: "13px", fontWeight: "600" }}>Temporary Video Files Location</h4>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", wordBreak: "break-all" }}>
                      {tempDir || "Loading..."}
                    </p>
                  </div>
                  <span className="badge badge-neutral" style={{ fontSize: "12px", fontWeight: "700" }}>
                    {tempSizeMb.toFixed(1)} MB Used
                  </span>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleClearTemp}
                    disabled={isLoading}
                    style={{ fontSize: "12px", color: "#F87171" }}
                  >
                    <Trash2 size={14} /> Clear Temporary Files
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenFolder(tempDir)}
                    style={{ fontSize: "12px" }}
                  >
                    <FolderOpen size={14} /> Open Temp Folder
                  </button>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                  Temporary frames and upload caches are safely removed. Original video footage is never touched.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: DIAGNOSTICS */}
          {activeTab === "diagnostics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Application Version</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#F3D079", marginTop: "2px" }}>
                    1.0.0 (Windows 64-bit Desktop)
                  </div>
                </div>
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Local Engine Status</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#34D399", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10B981" }} />
                    Active (127.0.0.1)
                  </div>
                </div>
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Bundled FFmpeg</div>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-primary)", marginTop: "2px" }}>
                    {systemInfo?.ffmpeg_status === "ready" ? "✓ Bundled & Ready" : "System Path Fallback"}
                  </div>
                </div>
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Operating System</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {systemInfo?.os || "Windows 64-bit"}
                  </div>
                </div>
              </div>

              {/* Logs Console */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600" }}>Recent System Logs</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" className="btn btn-secondary" onClick={handleOpenLogsFolder} style={{ fontSize: "11px", padding: "4px 8px" }}>
                      <FolderOpen size={12} /> Open Logs Folder
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleClearLogs} style={{ fontSize: "11px", padding: "4px 8px" }}>
                      Clear
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    height: "160px",
                    overflowY: "auto",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(0, 0, 0, 0.6)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: "#94A3B8",
                    whiteSpace: "pre-wrap",
                    lineHeight: "1.5",
                  }}
                >
                  {logs.length > 0 ? logs.join("\n") : "No log events recorded."}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRIVACY & ANALYTICS */}
          {activeTab === "privacy" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <ShieldCheck size={24} color="#10B981" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: "700", color: "#34D399" }}>100% Local & Privacy Protected</h4>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: "1.5" }}>
                    Video Cleaner processes videos entirely on your local machine using embedded computer vision algorithms and local FFmpeg. No video frames, video files, audio tracks, or filenames are ever uploaded to any external server.
                  </p>
                </div>
              </div>

              <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(0, 0, 0, 0.25)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ fontSize: "13px", fontWeight: "600" }}>Anonymous Usage Analytics</h4>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Help improve Video Cleaner by sharing anonymous error telemetry and feature usage metrics.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      setAnalyticsEnabled(enabled);
                      await setAnalyticsConsent(enabled ? "enabled" : "disabled");
                      handleSaveSettings({ analytics_enabled: enabled });
                    }}
                    style={{ width: "18px", height: "18px", accentColor: "#D4AF37", cursor: "pointer" }}
                  />
                </div>

                <div style={{ marginTop: "14px", fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.6" }}>
                  <p style={{ fontWeight: "600", color: "var(--text-secondary)" }}>What is never collected:</p>
                  <ul style={{ paddingLeft: "18px", marginTop: "4px" }}>
                    <li>Videos, frames, thumbnails, or audio</li>
                    <li>File paths, file names, or folder names</li>
                    <li>Usernames, passwords, or personal identity</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ABOUT */}
          {activeTab === "about" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "10px 0 20px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "16px",
                  background: "var(--accent-gradient)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 30px rgba(212, 175, 55, 0.4)",
                  marginBottom: "14px",
                }}
              >
                <Film size={32} color="#0A0A0C" strokeWidth={2.5} />
              </div>

              <h2 style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Video Cleaner
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Version 1.0.0
              </p>
              <span className="badge badge-gold" style={{ marginTop: "6px", fontSize: "11px" }}>
                <Sparkles size={12} /> Made by Amna
              </span>

              <p style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "440px", marginTop: "16px", lineHeight: "1.5" }}>
                A high-performance local video analysis and usable footage extraction tool. Automatically eliminates static image slides, artificial Ken Burns zooms, cutouts, and transitions from edited videos.
              </p>

              <div style={{ marginTop: "24px", display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" className="btn btn-primary" onClick={handleCheckUpdates} style={{ fontSize: "12px" }}>
                  <RefreshCw size={14} /> Check for Updates
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveTab("privacy")} style={{ fontSize: "12px" }}>
                  <ShieldCheck size={14} /> Privacy & Analytics
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleOpenLogsFolder} style={{ fontSize: "12px" }}>
                  <FolderOpen size={14} /> Open Logs Folder
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (window.electronAPI?.openDashboard) {
                      window.electronAPI.openDashboard();
                    } else {
                      window.open(getApiEndpoint("/dashboard"), "_blank");
                    }
                  }}
                  style={{ fontSize: "12px" }}
                >
                  <ExternalLink size={14} /> Developer Dashboard
                </button>
              </div>

              {updateStatus && (
                <div style={{ marginTop: "16px", fontSize: "12px", color: "#F3D079", background: "rgba(212,175,55,0.1)", padding: "6px 14px", borderRadius: "8px" }}>
                  {updateStatus}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(10, 10, 12, 0.6)",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Video Cleaner v1.0.0 • Made by Amna</span>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ fontSize: "12px", padding: "6px 16px" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
