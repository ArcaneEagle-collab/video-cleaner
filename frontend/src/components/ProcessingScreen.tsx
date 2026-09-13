import React from "react";
import { Loader2, CheckCircle2, Clock, Image, Film, XCircle } from "lucide-react";
import { ProgressData } from "../types/video";

interface ProcessingScreenProps {
  progress: ProgressData | null;
  onCancel: () => void;
  isCancelling: boolean;
}

export const ProcessingScreen: React.FC<ProcessingScreenProps> = ({
  progress,
  onCancel,
  isCancelling,
}) => {
  const percent = progress?.percent ?? 5;
  const currentStage = progress?.stage ?? "Initializing pipeline...";

  const stages = [
    { name: "Scene detection", minPct: 15 },
    { name: "Motion analysis", minPct: 40 },
    { name: "Image & zoom detection", minPct: 75 },
    { name: "Transition & background detection", minPct: 88 },
    { name: "Final classification", minPct: 98 },
  ];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="glass-panel" style={{ padding: "36px 32px", display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(212, 175, 55, 0.15)",
              border: "1px solid rgba(212, 175, 55, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(212, 175, 55, 0.25)",
            }}
          >
            <Loader2 size={26} color="#D4AF37" className="animate-spin" />
          </div>
          <div>
            <h3 style={{ fontSize: "19px", fontWeight: "700" }}>Analyzing Video in Progress...</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Running multi-detector computer vision analysis locally
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-danger"
          onClick={onCancel}
          disabled={isCancelling}
          style={{ padding: "9px 20px" }}
        >
          <XCircle size={16} /> {isCancelling ? "Cancelling..." : "Cancel Analysis"}
        </button>
      </div>

      {/* Main Gradient Progress Bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", fontWeight: "600" }}>
          <span style={{ color: "#F3D079" }}>{currentStage}</span>
          <span className="mono" style={{ color: "var(--text-primary)", fontWeight: "700" }}>{percent.toFixed(0)}%</span>
        </div>
        <div style={{ width: "100%", height: "12px", background: "rgba(18, 18, 24, 0.85)", borderRadius: "9999px", overflow: "hidden", padding: "2px", border: "1px solid rgba(212, 175, 55, 0.15)" }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(2, percent))}%`,
              height: "100%",
              background: "var(--accent-gradient)",
              borderRadius: "9999px",
              transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 0 16px rgba(212, 175, 55, 0.5)",
            }}
          />
        </div>
      </div>

      {/* Stage Checklist */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", background: "rgba(0, 0, 0, 0.2)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
        {stages.map((st) => {
          const isDone = percent >= st.minPct;
          const isCurrent = percent < st.minPct && percent >= st.minPct - 25;
          return (
            <div
              key={st.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                borderRadius: "8px",
                background: isCurrent ? "rgba(212, 175, 55, 0.14)" : "transparent",
                border: isCurrent ? "1px solid rgba(212, 175, 55, 0.35)" : "1px solid transparent",
              }}
            >
              {isDone ? (
                <CheckCircle2 size={16} color="#10B981" />
              ) : isCurrent ? (
                <Loader2 size={16} color="#D4AF37" className="animate-spin" />
              ) : (
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid #475569" }} />
              )}
              <span style={{ fontSize: "13px", color: isDone ? "#F8FAFC" : isCurrent ? "#F3D079" : "var(--text-muted)", fontWeight: isCurrent ? "700" : "500" }}>
                {st.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Live Metrics Counter Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
        <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={13} /> Current Timestamp
          </span>
          <p className="mono" style={{ fontSize: "17px", fontWeight: "700", marginTop: "4px", color: "#F8FAFC" }}>
            {formatTime(progress?.timestamp ?? 0)} / {formatTime(progress?.total_duration ?? 0)}
          </p>
        </div>

        <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Film size={13} /> Scenes Detected
          </span>
          <p className="mono" style={{ fontSize: "17px", fontWeight: "700", marginTop: "4px", color: "#F3D079" }}>
            {progress?.scenes_detected ?? 0}
          </p>
        </div>

        <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Image size={13} color="#EF4444" /> Likely Image Segments
          </span>
          <p className="mono" style={{ fontSize: "17px", fontWeight: "700", marginTop: "4px", color: "#EF4444" }}>
            {progress?.likely_images ?? 0}
          </p>
        </div>

        <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <CheckCircle2 size={13} color="#10B981" /> Likely Usable Segments
          </span>
          <p className="mono" style={{ fontSize: "17px", fontWeight: "700", marginTop: "4px", color: "#10B981" }}>
            {progress?.likely_usable ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
};
