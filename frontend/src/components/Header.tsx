import React from "react";
import { Film, Sparkles, Layers, History, ShieldCheck, Settings } from "lucide-react";

interface HeaderProps {
  activeTab: "workspace" | "batch" | "projects";
  setActiveTab: (tab: "workspace" | "batch" | "projects") => void;
  isBackendConnected: boolean;
  batchCount: number;
  projectCount: number;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isBackendConnected,
  batchCount,
  projectCount,
  onOpenSettings,
}) => {
  return (
    <header className="glass-panel" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: "var(--accent-gradient)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 24px rgba(212, 175, 55, 0.45)",
          border: "1px solid rgba(255, 238, 170, 0.5)",
        }}>
          <Film size={24} color="#0A0A0C" strokeWidth={2.4} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{
              fontSize: "20px",
              fontWeight: "800",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "linear-gradient(135deg, #FFF0B3 0%, #D4AF37 50%, #F5D77F 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Video Cleaner
            </h1>
            <span style={{ fontSize: "11px", color: "#F3D079", fontWeight: "700", letterSpacing: "0.04em" }}>
              by Amna
            </span>
            <span className="badge badge-gold" style={{ marginLeft: "4px" }}>
              <Sparkles size={12} color="#D4AF37" /> Local AI / CV
            </span>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Intelligent Editorial Image Removal & Usable Footage Extractor
          </p>
        </div>
      </div>

      {/* Center Nav tabs */}
      <div style={{ display: "flex", background: "rgba(0, 0, 0, 0.3)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
        <button
          className={`btn ${activeTab === "workspace" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "8px 16px", fontSize: "13px", border: "none" }}
          onClick={() => setActiveTab("workspace")}
        >
          <Film size={15} /> Studio Workspace
        </button>
        <button
          className={`btn ${activeTab === "batch" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "8px 16px", fontSize: "13px", border: "none" }}
          onClick={() => setActiveTab("batch")}
        >
          <Layers size={15} /> Batch Queue {batchCount > 0 && <span className="badge badge-neutral" style={{ padding: "2px 6px", fontSize: "10px" }}>{batchCount}</span>}
        </button>
        <button
          className={`btn ${activeTab === "projects" ? "btn-primary" : "btn-secondary"}`}
          style={{ padding: "8px 16px", fontSize: "13px", border: "none" }}
          onClick={() => setActiveTab("projects")}
        >
          <History size={15} /> Recent Exports {projectCount > 0 && <span className="badge badge-neutral" style={{ padding: "2px 6px", fontSize: "10px" }}>{projectCount}</span>}
        </button>
      </div>

      {/* Engine Status & Settings */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: isBackendConnected ? "#34D399" : "#F87171" }}>
          <span style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: isBackendConnected ? "#10B981" : "#EF4444",
            boxShadow: isBackendConnected ? "0 0 10px #10B981" : "0 0 10px #EF4444"
          }} />
          <span style={{ fontWeight: "600" }}>{isBackendConnected ? "Local Engine Active" : "Connecting..."}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)", paddingLeft: "8px", borderLeft: "1px solid var(--border-subtle)" }}>
          <ShieldCheck size={14} color="#10B981" /> 100% Private
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenSettings}
          title="Settings & Diagnostics"
          style={{
            padding: "8px 14px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            borderRadius: "8px",
            border: "1px solid rgba(212, 175, 55, 0.3)",
          }}
        >
          <Settings size={15} color="#D4AF37" />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};
