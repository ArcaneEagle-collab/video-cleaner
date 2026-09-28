import React, { useState, useEffect, useCallback } from "react";
import { X, ArrowUpCircle, Download, RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";

interface UpdateAvailableInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseName?: string;
  isDownloading?: boolean;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface UpdateReadyInfo {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
}

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; info: UpdateAvailableInfo }
  | { phase: "downloading"; info: UpdateAvailableInfo; progress: number; speed: number }
  | { phase: "ready"; info: UpdateReadyInfo };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * UpdateNotification — shows a floating bottom-right toast that moves through
 * three states: "downloading" → progress bar → "ready to install / restart".
 *
 * Everything runs silently via electron-updater. Users never see GitHub.
 */
export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ── IPC listeners ─────────────────────────────────────────────────────────
  const handleUpdateAvailable = useCallback((info: UpdateAvailableInfo) => {
    setDismissed(false);
    setState({ phase: "available", info });
  }, []);

  const handleDownloadProgress = useCallback((progress: DownloadProgress) => {
    setState((prev) => {
      const info =
        prev.phase === "available" || prev.phase === "downloading"
          ? (prev as any).info
          : { hasUpdate: true, currentVersion: "", latestVersion: "" };
      return {
        phase: "downloading",
        info,
        progress: progress.percent,
        speed: progress.bytesPerSecond,
      };
    });
  }, []);

  const handleUpdateReady = useCallback((info: UpdateReadyInfo) => {
    setDismissed(false);
    setState({ phase: "ready", info });
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onUpdateAvailable?.(handleUpdateAvailable);
    window.electronAPI.onUpdateDownloadProgress?.(handleDownloadProgress);
    window.electronAPI.onUpdateReady?.(handleUpdateReady);
  }, [handleUpdateAvailable, handleDownloadProgress, handleUpdateReady]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await window.electronAPI?.installUpdate?.();
    } catch {
      setIsInstalling(false);
    }
  };

  // ── Render nothing when idle / dismissed ─────────────────────────────────
  if (state.phase === "idle" || dismissed) return null;

  // ── Derived display values ────────────────────────────────────────────────
  const releaseNotes =
    state.phase === "available"
      ? state.info.releaseNotes
      : state.phase === "ready" || state.phase === "downloading"
      ? (state as any).info?.releaseNotes
      : undefined;

  const releaseName =
    state.phase === "available"
      ? state.info.releaseName
      : state.phase === "ready"
      ? state.info.releaseName
      : state.phase === "downloading"
      ? (state as any).info?.releaseName
      : undefined;

  const latestVersion =
    state.phase === "available"
      ? state.info.latestVersion
      : state.phase === "ready"
      ? state.info.version
      : state.phase === "downloading"
      ? (state as any).info?.latestVersion
      : "";

  const currentVersion =
    state.phase === "available" || state.phase === "downloading"
      ? (state as any).info?.currentVersion
      : "";

  const isReady = state.phase === "ready";
  const isDownloading = state.phase === "downloading";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        width: "340px",
        borderRadius: "16px",
        background: "linear-gradient(135deg, #0D1117 0%, #161B22 100%)",
        border: `1px solid ${isReady ? "rgba(16,185,129,0.5)" : "rgba(212,175,55,0.5)"}`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px ${isReady ? "rgba(16,185,129,0.1)" : "rgba(212,175,55,0.1)"}`,
        animation: "slideInFromBottom 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          height: "3px",
          background: isReady
            ? "linear-gradient(90deg,#10B981,#34D399,#10B981)"
            : "linear-gradient(90deg,#D4AF37,#F5D77F,#D4AF37)",
          backgroundSize: "200% 100%",
          animation: isDownloading ? "shimmer 1.2s linear infinite" : "shimmer 3s linear infinite",
        }}
      />

      <div style={{ padding: "16px 18px 18px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "9px",
                background: isReady
                  ? "linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.06))"
                  : "linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.06))",
                border: `1px solid ${isReady ? "rgba(16,185,129,0.35)" : "rgba(212,175,55,0.35)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isReady ? (
                <CheckCircle2 size={16} color="#34D399" />
              ) : isDownloading ? (
                <Download size={16} color="#F3D079" style={{ animation: "pulse 1s ease-in-out infinite" }} />
              ) : (
                <ArrowUpCircle size={16} color="#F3D079" />
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: isReady ? "#34D399" : "#F3D079",
                  letterSpacing: "0.02em",
                  lineHeight: 1.2,
                }}
              >
                {isReady
                  ? "Update Ready to Install"
                  : isDownloading
                  ? "Downloading Update..."
                  : "Update Available"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                {currentVersion ? `v${currentVersion} → v${latestVersion}` : `v${latestVersion}`}
              </div>
            </div>
          </div>

          {/* Only allow dismiss when not installing */}
          {!isInstalling && (
            <button
              onClick={() => setDismissed(true)}
              title="Dismiss"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#475569",
                padding: "4px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget).style.color = "#94A3B8")}
              onMouseLeave={(e) => ((e.currentTarget).style.color = "#475569")}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Release name badge */}
        {releaseName && (
          <div style={{ fontSize: "11.5px", color: "#CBD5E1", marginBottom: "10px", fontWeight: "600" }}>
            <Sparkles size={10} style={{ display: "inline", marginRight: "4px", color: "#D4AF37" }} />
            {releaseName}
          </div>
        )}

        {/* Download progress bar */}
        {isDownloading && (
          <div style={{ marginBottom: "14px" }}>
            <div
              style={{
                height: "6px",
                borderRadius: "3px",
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
                marginBottom: "6px",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${state.progress}%`,
                  borderRadius: "3px",
                  background: "linear-gradient(90deg,#D4AF37,#F5D77F)",
                  transition: "width 0.4s ease",
                  boxShadow: "0 0 8px rgba(212,175,55,0.5)",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748B" }}>
              <span>{Math.round(state.progress)}% downloaded</span>
              <span>{formatBytes(state.speed)}</span>
            </div>
          </div>
        )}

        {/* Release notes (expandable) */}
        {releaseNotes && !isDownloading && (
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{
                fontSize: "11.5px",
                color: "#94A3B8",
                lineHeight: "1.55",
                maxHeight: expanded ? "120px" : "38px",
                overflow: "hidden",
                transition: "max-height 0.3s ease",
              }}
            >
              {releaseNotes}
            </div>
            {releaseNotes.length > 90 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: isReady ? "#34D399" : "#D4AF37",
                  fontSize: "11px",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginTop: "2px",
                  fontWeight: "600",
                }}
              >
                {expanded ? "Show less ▲" : "Show more ▼"}
              </button>
            )}
          </div>
        )}

        {/* Ready-to-install description */}
        {isReady && !releaseNotes && (
          <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "12px", lineHeight: 1.5 }}>
            The update has been downloaded silently. Restart Video Cleaner to apply it.
          </div>
        )}

        {/* Action button */}
        {isReady && (
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "10px",
              background: isInstalling
                ? "rgba(16,185,129,0.15)"
                : "linear-gradient(135deg,#10B981 0%,#059669 100%)",
              border: isInstalling ? "1px solid rgba(16,185,129,0.3)" : "none",
              color: isInstalling ? "#34D399" : "#fff",
              fontSize: "13px",
              fontWeight: "700",
              cursor: isInstalling ? "wait" : "pointer",
              transition: "opacity 0.2s, transform 0.1s",
              letterSpacing: "0.02em",
            }}
            onMouseEnter={(e) => {
              if (!isInstalling) (e.currentTarget).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget).style.transform = "translateY(0)";
            }}
          >
            <RefreshCw size={14} style={{ animation: isInstalling ? "spin 1s linear infinite" : "none" }} />
            {isInstalling ? "Restarting..." : "Restart & Install Update"}
          </button>
        )}

        {/* Downloading — no button, auto installs on quit */}
        {isDownloading && (
          <div style={{ fontSize: "11px", color: "#475569", textAlign: "center" }}>
            Downloading in background — the app will install on next restart.
          </div>
        )}

        {/* Available but not yet downloading */}
        {state.phase === "available" && (
          <div style={{ fontSize: "11px", color: "#475569", textAlign: "center" }}>
            Downloading silently in the background…
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInFromBottom {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default UpdateNotification;
