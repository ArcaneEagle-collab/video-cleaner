import React, { useState } from "react";
import { Check, X, RotateCcw, CheckCheck, Trash2, Filter, Info, Scissors } from "lucide-react";
import { Segment } from "../types/video";

interface SegmentTableProps {
  segments: Segment[];
  activeSegmentId: string | null;
  onSelectSegment: (seg: Segment) => void;
  onToggleSegmentAction: (segmentId: string, action: "KEEP" | "REMOVE") => void;
  onBulkAction: (mode: "keep_all" | "remove_detected" | "reset") => void;
  onSplitSegment: (segmentId: string, splitTime: number) => void;
  currentTime: number;
}

export const SegmentTable: React.FC<SegmentTableProps> = ({
  segments,
  activeSegmentId,
  onSelectSegment,
  onToggleSegmentAction,
  onBulkAction,
  onSplitSegment,
  currentTime,
}) => {
  const [filter, setFilter] = useState<"all" | "keep" | "remove">("all");

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
  };

  const filteredSegments = segments.filter((seg) => {
    const effectiveAction = seg.user_override || seg.action;
    if (filter === "keep") return effectiveAction === "KEEP";
    if (filter === "remove") return effectiveAction === "REMOVE";
    return true;
  });

  const keepCount = segments.filter((s) => (s.user_override || s.action) === "KEEP").length;
  const removeCount = segments.filter((s) => (s.user_override || s.action) === "REMOVE").length;

  return (
    <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Top Header & Actions Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Detected Segments Table</h3>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Review, override, or split individual detected scenes
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0, 0, 0, 0.3)", padding: "4px", borderRadius: "8px" }}>
          <button
            type="button"
            className={`btn ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "5px 12px", fontSize: "12px", border: "none" }}
            onClick={() => setFilter("all")}
          >
            All ({segments.length})
          </button>
          <button
            type="button"
            className={`btn ${filter === "keep" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "5px 12px", fontSize: "12px", border: "none" }}
            onClick={() => setFilter("keep")}
          >
            Keep ({keepCount})
          </button>
          <button
            type="button"
            className={`btn ${filter === "remove" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "5px 12px", fontSize: "12px", border: "none" }}
            onClick={() => setFilter("remove")}
          >
            Remove ({removeCount})
          </button>
        </div>

        {/* Bulk Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
            onClick={() => onBulkAction("keep_all")}
            title="Mark all segments to Keep"
          >
            <CheckCheck size={14} color="#10B981" /> Keep All
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
            onClick={() => onBulkAction("remove_detected")}
            title="Remove all flagged image & transition segments"
          >
            <Trash2 size={14} color="#EF4444" /> Remove All Detected
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
            onClick={() => onBulkAction("reset")}
            title="Reset manual overrides to automatic classification"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ maxHeight: "420px", overflowY: "auto", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "rgba(15, 23, 42, 0.95)", position: "sticky", top: 0, zIndex: 5, borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>ID</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>Start</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>End</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>Duration</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>Type</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>Confidence</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600" }}>Reason</th>
              <th style={{ padding: "10px 14px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredSegments.map((seg) => {
              const isActive = seg.id === activeSegmentId;
              const effectiveAction = seg.user_override || seg.action;

              return (
                <tr
                  key={seg.id}
                  onClick={() => onSelectSegment(seg)}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                    background: isActive
                      ? "rgba(212, 175, 55, 0.16)"
                      : "transparent",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "rgba(212, 175, 55, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td className="mono" style={{ padding: "10px 14px", color: "#F3D079", fontWeight: "600" }}>
                    {seg.id}
                  </td>
                  <td className="mono" style={{ padding: "10px 14px" }}>
                    {formatTime(seg.start)}
                  </td>
                  <td className="mono" style={{ padding: "10px 14px" }}>
                    {formatTime(seg.end)}
                  </td>
                  <td className="mono" style={{ padding: "10px 14px" }}>
                    {seg.duration.toFixed(1)}s
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      className={`badge ${
                        effectiveAction === "KEEP"
                          ? "badge-keep"
                          : effectiveAction === "REMOVE"
                          ? "badge-remove"
                          : "badge-uncertain"
                      }`}
                    >
                      {seg.classification.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: "10px 14px", fontWeight: "600" }}>
                    {seg.confidence_percent}%
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-secondary)", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={seg.reason}>
                    {seg.reason}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <button
                        type="button"
                        className={`btn ${effectiveAction === "KEEP" ? "btn-success" : "btn-secondary"}`}
                        style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "6px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSegmentAction(seg.id, "KEEP");
                        }}
                        title="Force Keep"
                      >
                        <Check size={13} /> Keep
                      </button>

                      <button
                        type="button"
                        className={`btn ${effectiveAction === "REMOVE" ? "btn-danger" : "btn-secondary"}`}
                        style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "6px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSegmentAction(seg.id, "REMOVE");
                        }}
                        title="Force Remove"
                      >
                        <X size={13} /> Remove
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "4px 6px", fontSize: "11px", borderRadius: "6px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSplitSegment(seg.id, currentTime);
                        }}
                        title="Split Segment at Playhead"
                      >
                        <Scissors size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
