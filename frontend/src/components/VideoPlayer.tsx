import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Scissors,
  Check,
  X,
  HelpCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { Segment, VideoMetadata } from "../types/video";
import { getApiEndpoint } from "../config/api";

interface VideoPlayerProps {
  metadata: VideoMetadata;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  segments: Segment[];
  activeSegment: Segment | null;
  onToggleSegmentAction: (segmentId: string, action: "KEEP" | "REMOVE") => void;
  onSplitSegment: (segmentId: string, splitTime: number) => void;
  onSelectSegment: (seg: Segment) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  metadata,
  currentTime,
  setCurrentTime,
  segments,
  activeSegment,
  onToggleSegmentAction,
  onSplitSegment,
  onSelectSegment,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const fps = metadata.fps || 30.0;
  const frameDuration = 1.0 / fps;

  // Stream URL
  const videoSrc = metadata.stream_url
    ? getApiEndpoint(metadata.stream_url)
    : getApiEndpoint(`/api/stream/${metadata.upload_id || metadata.filename}`);

  // Sync video element time when currentTime changes externally
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.15) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const stepFrame = (frames: number) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    const newTime = Math.max(0, Math.min(metadata.duration, videoRef.current.currentTime + frames * frameDuration));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipSegment = (direction: "prev" | "next") => {
    if (!segments.length) return;
    const currentIdx = activeSegment ? segments.findIndex((s) => s.id === activeSegment.id) : 0;
    let targetIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx >= segments.length) targetIdx = segments.length - 1;

    const targetSeg = segments[targetIdx];
    if (targetSeg) {
      onSelectSegment(targetSeg);
      if (videoRef.current) {
        videoRef.current.currentTime = targetSeg.start;
        setCurrentTime(targetSeg.start);
      }
    }
  };

  const changePlaybackRate = () => {
    if (!videoRef.current) return;
    const rates = [1.0, 1.5, 2.0, 0.5];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    videoRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
  };

  const effectiveAction = activeSegment?.user_override || activeSegment?.action;

  return (
    <div className="glass-panel" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Video Container */}
      <div style={{ position: "relative", background: "#000000", aspectRatio: "16/9", maxHeight: "520px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <video
          ref={videoRef}
          src={videoSrc}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          muted={isMuted}
        />

        {/* Floating Active Segment Classification Badge on Video */}
        {activeSegment && (
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              background: "rgba(15, 23, 42, 0.85)",
              backdropFilter: "blur(8px)",
              padding: "6px 12px",
              borderRadius: "8px",
              border: `1px solid ${
                effectiveAction === "KEEP"
                  ? "#10B981"
                  : effectiveAction === "REMOVE"
                  ? "#EF4444"
                  : "#F59E0B"
              }`,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              fontWeight: "700",
              zIndex: 10,
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background:
                  effectiveAction === "KEEP"
                    ? "#10B981"
                    : effectiveAction === "REMOVE"
                    ? "#EF4444"
                    : "#F59E0B",
              }}
            />
            <span>{activeSegment.classification.replace(/_/g, " ")}</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: "500" }}>
              ({activeSegment.confidence_percent}%)
            </span>
          </div>
        )}
      </div>

      {/* Media Controller Bar */}
      <div style={{ padding: "14px 20px", background: "rgba(15, 23, 42, 0.9)", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        {/* Playback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px", borderRadius: "8px" }}
            onClick={() => skipSegment("prev")}
            title="Previous Segment"
          >
            <SkipBack size={16} />
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px", borderRadius: "8px" }}
            onClick={() => stepFrame(-1)}
            title="Previous Frame (-1 frame)"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: "10px 18px", borderRadius: "10px" }}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause size={18} color="#0A0A0C" /> : <Play size={18} fill="#0A0A0C" color="#0A0A0C" />}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px", borderRadius: "8px" }}
            onClick={() => stepFrame(1)}
            title="Next Frame (+1 frame)"
          >
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px", borderRadius: "8px" }}
            onClick={() => skipSegment("next")}
            title="Next Segment"
          >
            <SkipForward size={16} />
          </button>

          <span className="mono" style={{ fontSize: "14px", fontWeight: "600", marginLeft: "12px" }}>
            {formatTime(currentTime)} / {formatTime(metadata.duration)}
          </span>
        </div>

        {/* Secondary controls: Speed, Mute, Fullscreen */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-secondary mono"
            style={{ padding: "6px 10px", fontSize: "12px" }}
            onClick={changePlaybackRate}
            title="Playback Speed"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px" }}
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = !isMuted;
                setIsMuted(!isMuted);
              }
            }}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "8px" }}
            onClick={() => {
              if (videoRef.current?.requestFullscreen) {
                videoRef.current.requestFullscreen();
              }
            }}
            title="Fullscreen"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Active Segment Inspector & Manual Override Controls */}
      {activeSegment && (
        <div style={{ padding: "16px 20px", background: "rgba(0, 0, 0, 0.4)", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <span style={{ fontSize: "14px", fontWeight: "700" }}>
                Active Segment: {activeSegment.id}
              </span>
              <span className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                [{formatTime(activeSegment.start)} – {formatTime(activeSegment.end)}] ({activeSegment.duration.toFixed(1)}s)
              </span>
              {activeSegment.user_override && (
                <span className="badge badge-neutral" style={{ fontSize: "11px" }}>
                  Manual Override Active
                </span>
              )}
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Reason: <span style={{ color: "var(--text-primary)" }}>{activeSegment.reason}</span>
            </p>
          </div>

          {/* Action Override Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className={`btn ${effectiveAction === "KEEP" ? "btn-success" : "btn-secondary"}`}
              style={{ padding: "8px 16px", fontSize: "13px" }}
              onClick={() => onToggleSegmentAction(activeSegment.id, "KEEP")}
            >
              <Check size={16} /> Keep Segment
            </button>

            <button
              type="button"
              className={`btn ${effectiveAction === "REMOVE" ? "btn-danger" : "btn-secondary"}`}
              style={{ padding: "8px 16px", fontSize: "13px" }}
              onClick={() => onToggleSegmentAction(activeSegment.id, "REMOVE")}
            >
              <X size={16} /> Remove Segment
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "8px 14px", fontSize: "13px" }}
              onClick={() => onSplitSegment(activeSegment.id, currentTime)}
              title="Split segment into two at current playhead position"
            >
              <Scissors size={15} /> Split
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
