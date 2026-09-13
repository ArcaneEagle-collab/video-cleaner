import React from "react";
import { ShieldCheck, Sparkles, X, Check } from "lucide-react";
import { setAnalyticsConsent } from "../services/analytics";

interface AnalyticsConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnalyticsConsentModal: React.FC<AnalyticsConsentModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleChoice = async (enable: boolean) => {
    await setAnalyticsConsent(enable ? "enabled" : "disabled");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "480px",
          borderRadius: "16px",
          border: "1px solid rgba(212, 175, 55, 0.4)",
          background: "linear-gradient(180deg, rgba(26, 26, 32, 0.98) 0%, rgba(15, 15, 18, 0.98) 100%)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 30px rgba(212, 175, 55, 0.15)",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 24px 16px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.05) 100%)",
              border: "1px solid rgba(212, 175, 55, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={24} color="#F3D079" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700", color: "#F8FAFC", margin: 0, letterSpacing: "0.02em" }}>
              Help improve Video Cleaner
            </h2>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
              <Sparkles size={11} color="#D4AF37" /> Privacy-Conscious Telemetry
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          <p style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--text-secondary)", margin: 0 }}>
            Video Cleaner can send anonymous usage statistics such as app version, features used, processing success/failure, and performance information.
          </p>

          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid var(--border-subtle)",
              fontSize: "12px",
              color: "#94A3B8",
              lineHeight: "1.5",
            }}
          >
            <strong style={{ color: "#F3D079" }}>Our Privacy Guarantee:</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>No videos or frames are ever uploaded</li>
              <li>No filenames or file paths are ever collected</li>
              <li>No personal information or account data</li>
              <li>Can be disabled at any time in Settings &rarr; Privacy</li>
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "16px 24px 22px",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            borderTop: "1px solid var(--border-subtle)",
            background: "rgba(10, 10, 12, 0.4)",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleChoice(false)}
            style={{
              padding: "9px 18px",
              fontSize: "13px",
              borderRadius: "8px",
            }}
          >
            <X size={15} /> No Thanks
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleChoice(true)}
            style={{
              padding: "9px 20px",
              fontSize: "13px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #D4AF37 0%, #AA7C11 100%)",
              color: "#0A0A0C",
              fontWeight: "700",
            }}
          >
            <Check size={15} /> Enable Anonymous Analytics
          </button>
        </div>
      </div>
    </div>
  );
};
