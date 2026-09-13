import React from "react";
import { Sliders, Sparkles, Zap, ShieldAlert, Cpu } from "lucide-react";
import { AnalysisSettings } from "../types/video";

interface SettingsPanelProps {
  settings: AnalysisSettings;
  setSettings: React.Dispatch<React.SetStateAction<AnalysisSettings>>;
  onStartAnalysis: () => void;
  isAnalyzing: boolean;
  isVideoLoaded: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  setSettings,
  onStartAnalysis,
  isAnalyzing,
  isVideoLoaded,
}) => {
  const update = <K extends keyof AnalysisSettings>(key: K, value: AnalysisSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="glass-panel" style={{ padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Sliders size={20} color="#D4AF37" />
          <h3 style={{ fontSize: "17px", fontWeight: "700" }}>Analysis & Detection Settings</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <Cpu size={14} color="#10B981" /> Local Computer Vision Engine Active
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
        {/* Left Column: Sensitivity & Durations */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Detection Sensitivity */}
          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
              Detection Sensitivity
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {(["Conservative", "Medium", "Aggressive"] as const).map((level) => {
                const isSelected = settings.sensitivity === level;
                return (
                  <button
                    key={level}
                    type="button"
                    className="btn"
                    onClick={() => update("sensitivity", level)}
                    style={{
                      padding: "8px 12px",
                      fontSize: "13px",
                      background: isSelected ? "var(--accent-gradient)" : "rgba(24, 24, 30, 0.8)",
                      color: isSelected ? "#0A0A0C" : "var(--text-secondary)",
                      border: isSelected ? "1px solid rgba(255, 238, 170, 0.4)" : "1px solid var(--border-subtle)",
                      boxShadow: isSelected ? "0 0 16px rgba(212, 175, 55, 0.35)" : "none",
                      fontWeight: isSelected ? "700" : "500",
                    }}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              {settings.sensitivity === "Conservative" && "Conservative: Only remove very obvious, high-confidence images (≥85%). Protects subtle footage."}
              {settings.sensitivity === "Medium" && "Medium (Recommended): Balanced threshold (≥65%). Intelligently removes Ken Burns & still slides."}
              {settings.sensitivity === "Aggressive" && "Aggressive: Removes borderline and medium-confidence image segments (≥45%)."}
            </p>
          </div>

          {/* Minimum Usable Clip Duration */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                Minimum usable clip duration
              </label>
              <span className="mono" style={{ fontSize: "13px", fontWeight: "700", color: "#F3D079" }}>
                {settings.min_clip_duration.toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10.0"
              step="0.5"
              value={settings.min_clip_duration}
              onChange={(e) => update("min_clip_duration", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#D4AF37", cursor: "pointer" }}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Short surviving cuts below this threshold are rejected as unusable.
            </span>
          </div>

          {/* Minimum Clip Gap */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                Minimum clip gap
              </label>
              <span className="mono" style={{ fontSize: "13px", fontWeight: "700", color: "#F3D079" }}>
                {settings.min_clip_gap.toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={settings.min_clip_gap}
              onChange={(e) => update("min_clip_gap", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#D4AF37", cursor: "pointer" }}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Micro-gaps smaller than this between kept footage are seamlessly bridged.
            </span>
          </div>
        </div>

        {/* Right Column: Independent Detectors Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(0, 0, 0, 0.2)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
            Independent Detection Engines
          </span>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={settings.detect_static}
              onChange={(e) => update("detect_static", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span>Static image detection (SSIM + pHash + Sensor Noise)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={settings.detect_zoom_pan}
              onChange={(e) => update("detect_zoom_pan", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span>Zoom/pan image detection (Ken Burns Affine Planar Flow)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={settings.detect_transitions}
              onChange={(e) => update("detect_transitions", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span>Transition detection (Dips, crossfades, wipes, flashes)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={settings.detect_background}
              onChange={(e) => update("detect_background", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span>Simple-background image detection (Cutouts & flat backdrops)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={settings.detect_repeated}
              onChange={(e) => update("detect_repeated", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span>Repeated-image detection (Duplicate slide detector)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              checked={settings.detect_motion}
              onChange={(e) => update("detect_motion", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span>Motion analysis (Organic local variance & complexity)</span>
          </label>

          {/* AI-Assisted Classification (OFF by default) */}
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", marginTop: "6px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
            <input
              type="checkbox"
              checked={settings.ai_assisted}
              onChange={(e) => update("ai_assisted", e.target.checked)}
              style={{ accentColor: "#D4AF37", width: "16px", height: "16px" }}
            />
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              AI-assisted classification <span className="badge badge-neutral" style={{ fontSize: "10px", padding: "1px 6px" }}>Optional</span>
            </span>
          </label>
        </div>
      </div>

      {/* Start Button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "24px", gap: "12px" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setSettings({
              sensitivity: "Medium",
              min_clip_duration: 2.0,
              min_clip_gap: 0.3,
              detect_static: true,
              detect_zoom_pan: true,
              detect_transitions: true,
              detect_background: true,
              detect_repeated: true,
              detect_motion: true,
              ai_assisted: false,
            });
          }}
        >
          Reset to Defaults
        </button>

        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "11px 28px", fontSize: "15px" }}
          disabled={!isVideoLoaded || isAnalyzing}
          onClick={onStartAnalysis}
        >
          <Zap size={18} /> Start Video Cleaning Analysis
        </button>
      </div>
    </div>
  );
};
