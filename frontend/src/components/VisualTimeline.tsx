import React, { useState, useRef } from "react";
import { Segment } from "../types/video";

interface VisualTimelineProps {
  duration: number;
  segments: Segment[];
  currentTime: number;
  activeSegmentId: string | null;
  onSelectSegment: (seg: Segment) => void;
  onSeek: (time: number) => void;
}

export const VisualTimeline: React.FC<VisualTimelineProps> = ({
  duration,
  segments,
  currentTime,
  activeSegmentId,
  onSelectSegment,
  onSeek,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoveredSeg, setHoveredSeg] = useState<{ seg: Segment; x: number } | null>(null);

  const safeDuration = duration > 0 ? duration : 1.0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = clickRatio * safeDuration;
    onSeek(targetTime);

    // Find segment at this time
    const matched = segments.find((s) => targetTime >= s.start && targetTime <= s.end);
    if (matched) {
      onSelectSegment(matched);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getSegmentColor = (seg: Segment) => {
    const action = seg.user_override || seg.action;
    if (action === "KEEP") {
      return {
        bg: "rgba(16, 185, 129, 0.75)",
        border: "#10B981",
        glow: "0 0 10px rgba(16, 185, 129, 0.4)",
      };
    } else if (action === "REMOVE") {
      return {
        bg: "rgba(239, 68, 68, 0.75)",
        border: "#EF4444",
        glow: "0 0 10px rgba(239, 68, 68, 0.4)",
      };
    } else {
      return {
        bg: "rgba(245, 158, 11, 0.75)",
        border: "#F59E0B",
        glow: "0 0 10px rgba(245, 158, 11, 0.4)",
      };
    }
  };

  const playheadPercent = Math.max(0, Math.min(100, (currentTime / safeDuration) * 100));

  return (
    <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Timeline Header & Legend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Visual Footage Timeline
          </span>
          <span className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            00:00 – {formatTime(duration)}
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", fontWeight: "600" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#10B981", boxShadow: "0 0 8px #10B981" }} />
            <span>KEEP (Usable Video)</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#EF4444", boxShadow: "0 0 8px #EF4444" }} />
            <span>REMOVE (Image / Zoom / Pan)</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#F59E0B", boxShadow: "0 0 8px #F59E0B" }} />
            <span>UNCERTAIN</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Scrubber Bar */}
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        onMouseLeave={() => setHoveredSeg(null)}
        style={{
          position: "relative",
          width: "100%",
          height: "48px",
          background: "rgba(15, 23, 42, 0.9)",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          cursor: "pointer",
          overflow: "visible",
          userSelect: "none",
        }}
      >
        {/* Render Segment Blocks */}
        {segments.map((seg) => {
          const leftPct = (seg.start / safeDuration) * 100;
          const widthPct = Math.max(0.4, (seg.duration / safeDuration) * 100);
          const color = getSegmentColor(seg);
          const isActive = seg.id === activeSegmentId;

          return (
            <div
              key={seg.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSegment(seg);
                onSeek(seg.start);
              }}
              onMouseEnter={(e) => {
                const rect = timelineRef.current?.getBoundingClientRect();
                if (rect) {
                  setHoveredSeg({ seg, x: e.clientX - rect.left });
                }
              }}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: "4px",
                bottom: "4px",
                backgroundColor: color.bg,
                border: `1px solid ${isActive ? "#FFFFFF" : color.border}`,
                borderRadius: "4px",
                transition: "transform 0.15s ease",
                transform: isActive ? "scaleY(1.08)" : "none",
                boxShadow: isActive ? "0 0 15px #FFFFFF" : color.glow,
                zIndex: isActive ? 10 : 2,
              }}
            />
          );
        })}

        {/* Playhead Indicator Line */}
        <div
          style={{
            position: "absolute",
            left: `${playheadPercent}%`,
            top: "-6px",
            bottom: "-6px",
            width: "3px",
            backgroundColor: "#FAF8F5",
            borderRadius: "9999px",
            boxShadow: "0 0 10px #FFFFFF, 0 0 20px #D4AF37",
            zIndex: 20,
            pointerEvents: "none",
            transform: "translateX(-50%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-4px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
            }}
          />
        </div>

        {/* Hover Tooltip */}
        {hoveredSeg && (
          <div
            style={{
              position: "absolute",
              left: `${hoveredSeg.x}px`,
              bottom: "58px",
              transform: "translateX(-50%)",
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid var(--border-subtle)",
              backdropFilter: "blur(8px)",
              padding: "8px 12px",
              borderRadius: "8px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 30,
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#F8FAFC" }}>
              {hoveredSeg.seg.classification.replace(/_/g, " ")} ({hoveredSeg.seg.confidence_percent}%)
            </div>
            <div className="mono" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {formatTime(hoveredSeg.seg.start)} – {formatTime(hoveredSeg.seg.end)} ({hoveredSeg.seg.duration.toFixed(1)}s)
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Action: <span style={{ fontWeight: "700", color: hoveredSeg.seg.action === "KEEP" ? "#10B981" : "#EF4444" }}>{hoveredSeg.seg.action}</span>
            </div>
          </div>
        )}
      </div>

      {/* Time ticks ruler */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
        <span>00:00</span>
        <span>{formatTime(duration * 0.25)}</span>
        <span>{formatTime(duration * 0.5)}</span>
        <span>{formatTime(duration * 0.75)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};
