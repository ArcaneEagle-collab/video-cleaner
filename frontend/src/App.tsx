import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Header } from "./components/Header";
import { UploadZone } from "./components/UploadZone";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProcessingScreen } from "./components/ProcessingScreen";
import { VideoPlayer } from "./components/VideoPlayer";
import { VisualTimeline } from "./components/VisualTimeline";
import { SegmentTable } from "./components/SegmentTable";
import { ExportModal } from "./components/ExportModal";
import { SettingsModal } from "./components/SettingsModal";
import { AnalyticsConsentModal } from "./components/AnalyticsConsentModal";
import { BatchQueue, BatchItem } from "./components/BatchQueue";
import { RecentProjects } from "./components/RecentProjects";
import { useWebSocket } from "./hooks/useWebSocket";
import { getApiEndpoint } from "./config/api";
import { getAnalyticsConsent, trackEvent } from "./services/analytics";
import {
  VideoMetadata,
  Segment,
  AnalysisSettings,
  ExportSettings,
  ProgressData,
  ExportResult,
  ExportProgressData,
} from "./types/video";
import { Download, Sliders, ArrowLeft, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";

export function App() {
  const [activeTab, setActiveTab] = useState<"workspace" | "batch" | "projects">("workspace");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(() => getAnalyticsConsent() === "unset");

  // Video State
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // App Workflow Step: "import" | "analyzing" | "review"
  const [workflowStep, setWorkflowStep] = useState<"import" | "analyzing" | "review">("import");

  // Analysis Settings
  const [settings, setSettings] = useState<AnalysisSettings>({
    sensitivity: "Medium",
    min_clip_duration: 1.2,
    min_clip_gap: 0.3,
    detect_static: true,
    detect_zoom_pan: true,
    detect_transitions: true,
    detect_background: true,
    detect_repeated: true,
    detect_motion: true,
    ai_assisted: false,
  });

  // Export Settings
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    export_combined: true,
    export_individual: true,
    quality: "High",
    include_audio: true,
    codec: "libx264",
    padding_sec: 0.0,
  });

  // Analysis Progress State
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Segments & Player State
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressData | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // Batch Items
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [autoExportBatch, setAutoExportBatch] = useState(true);
  const batchPausedRef = useRef(false);

  // Initial mount lifecycle
  useEffect(() => {
    trackEvent("app_started");
    if (window.electronAPI?.onVideoDropped) {
      window.electronAPI.onVideoDropped(async (filePath: string) => {
        try {
          setIsUploading(true);
          const res = await fetch(getApiEndpoint("/api/load-local"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filepath: filePath }),
          });
          const data = await res.json();
          if (data.metadata) {
            setMetadata(data.metadata);
            setWorkflowStep("import");
          }
        } catch (err) {
          console.warn("Failed to load dropped video:", err);
        } finally {
          setIsUploading(false);
        }
      });
    }
  }, []);

  // WebSocket Callbacks
  const handleProgress = useCallback((data: ProgressData) => {
    setProgress(data);
  }, []);

  const handleCompleted = useCallback((res: any) => {
    if (res && res.segments) {
      setSegments(res.segments);
      if (res.segments.length > 0) {
        setActiveSegmentId(res.segments[0].id);
      }
      setWorkflowStep("review");
      trackEvent("analysis_completed", { segments_count: res.segments.length });
    }
  }, []);

  const handleError = useCallback((err: string) => {
    alert(`Analysis Error: ${err}`);
    setWorkflowStep("import");
    setIsCancelling(false);
    trackEvent("processing_error", { error_type: "pipeline_error" });
  }, []);

  const handleCancelled = useCallback(() => {
    setWorkflowStep("import");
    setIsCancelling(false);
    setProgress(null);
    trackEvent("processing_cancelled");
  }, []);

  const handleExportProgress = useCallback((data: ExportProgressData) => {
    setExportProgress(data);
  }, []);

  const { isConnected } = useWebSocket(
    handleProgress,
    handleCompleted,
    handleError,
    handleCancelled,
    handleExportProgress
  );

  // Trigger Analysis
  const handleStartAnalysis = async () => {
    if (!metadata || workflowStep === "analyzing") return;
    setWorkflowStep("analyzing");
    setIsCancelling(false);
    setProgress({
      stage: "Starting analysis...",
      percent: 0,
      timestamp: 0,
      total_duration: metadata.duration,
      scenes_detected: 0,
      likely_images: 0,
      likely_usable: 0,
    });

    try {
      trackEvent("analysis_started");
      const res = await fetch(getApiEndpoint("/api/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path: metadata.filepath,
          sensitivity: settings.sensitivity,
          min_clip_duration: settings.min_clip_duration,
          min_clip_gap: settings.min_clip_gap,
          detect_static: settings.detect_static,
          detect_zoom_pan: settings.detect_zoom_pan,
          detect_transitions: settings.detect_transitions,
          detect_background: settings.detect_background,
          detect_repeated: settings.detect_repeated,
          detect_motion: settings.detect_motion,
          ai_assisted: settings.ai_assisted,
        }),
      });
      const data = await res.json();
      if (data.task_id) {
        setCurrentTaskId(data.task_id);
      }
    } catch (err: any) {
      alert(`Failed to start analysis: ${err.message}`);
      setWorkflowStep("import");
    }
  };

  // Cancel Analysis
  const handleCancelAnalysis = async () => {
    if (!currentTaskId) {
      setWorkflowStep("import");
      return;
    }
    setIsCancelling(true);
    const formData = new FormData();
    formData.append("task_id", currentTaskId);
    try {
      await fetch(getApiEndpoint("/api/cancel"), {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Segment Selection
  const handleSelectSegment = (seg: Segment) => {
    setActiveSegmentId(seg.id);
  };

  // Manual Overrides
  const handleToggleSegmentAction = (segmentId: string, action: "KEEP" | "REMOVE") => {
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id === segmentId) {
          return { ...s, user_override: action };
        }
        return s;
      })
    );
  };

  // Bulk Overrides
  const handleBulkAction = (mode: "keep_all" | "remove_detected" | "reset") => {
    setSegments((prev) =>
      prev.map((s) => {
        if (mode === "keep_all") return { ...s, user_override: "KEEP" };
        if (mode === "remove_detected") return { ...s, user_override: "REMOVE" };
        return { ...s, user_override: null };
      })
    );
  };

  // Split Segment
  const handleSplitSegment = (segmentId: string, splitTime: number) => {
    const target = segments.find((s) => s.id === segmentId);
    if (!target) return;
    if (splitTime <= target.start + 0.2 || splitTime >= target.end - 0.2) {
      alert("Split position must be at least 0.2 seconds away from segment boundaries.");
      return;
    }

    const seg1: Segment = {
      ...target,
      id: `${target.id}_a`,
      end: splitTime,
      duration: splitTime - target.start,
    };
    const seg2: Segment = {
      ...target,
      id: `${target.id}_b`,
      start: splitTime,
      duration: target.end - splitTime,
    };

    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segmentId);
      const copy = [...prev];
      copy.splice(idx, 1, seg1, seg2);
      return copy;
    });
  };

  // Execute Video Export
  const handleExport = async () => {
    if (!metadata) return;
    setIsExporting(true);
    setExportResult(null);
    setExportProgress({
      stage: "Starting clip extraction...",
      percent: 5,
    });

    try {
      const res = await fetch(getApiEndpoint("/api/export"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_path: metadata.filepath,
          segments: segments,
          export_combined: exportSettings.export_combined,
          export_individual: exportSettings.export_individual,
          quality: exportSettings.quality,
          include_audio: exportSettings.include_audio,
          codec: exportSettings.codec,
          padding_sec: exportSettings.padding_sec,
          output_dir: exportSettings.output_dir,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || `Export failed with HTTP status ${res.status}`);
      }
      setExportResult(data);
      if (data.status === "success") {
        setExportProgress({ stage: "Export completed successfully!", percent: 100 });
        if (exportSettings.export_combined) {
          trackEvent("clean_video_exported");
        }
        if (exportSettings.export_individual) {
          trackEvent("clip_exported", { clips_count: keptClipsCount });
        }
      }
    } catch (err: any) {
      trackEvent("export_error", { error_type: "export_failed" });
      setExportResult({
        status: "error",
        message: err.message || "Failed to export video footage",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Load Saved Project
  const handleLoadProject = async (analysisFile: string) => {
    try {
      // In this version, we can fetch metadata and set segments from the saved project
      alert(`Loaded saved state from ${analysisFile}. Switching to review mode.`);
    } catch (err) {
      console.error(err);
    }
  };

  // Add Files to Batch
  const handleAddBatchFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(getApiEndpoint("/api/upload"), {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.metadata) {
          setBatchItems((prev) => [
            ...prev,
            {
              id: `batch_${Date.now()}_${i}`,
              metadata: data.metadata,
              status: "waiting",
              progress: 0,
            },
          ]);
        }
      } catch (e) {
        console.error("Batch upload item error:", e);
      }
    }
  };

  // Pause Batch Processing
  const handlePauseBatch = () => {
    batchPausedRef.current = true;
    setIsProcessingBatch(false);
  };

  // Run Batch Processing on Autopilot
  const handleStartBatch = async () => {
    batchPausedRef.current = false;
    setIsProcessingBatch(true);

    for (let i = 0; i < batchItems.length; i++) {
      if (batchPausedRef.current) break;

      const item = batchItems[i];
      if (item.status === "completed" || item.status === "exported") continue;

      // Mark analyzing
      setBatchItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "analyzing", progress: 5, stage: "Starting analysis..." } : it
        )
      );

      try {
        const res = await fetch(getApiEndpoint("/api/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_path: item.metadata.filepath,
            sensitivity: settings.sensitivity,
            min_clip_duration: settings.min_clip_duration,
            min_clip_gap: settings.min_clip_gap,
            detect_static: settings.detect_static,
            detect_zoom_pan: settings.detect_zoom_pan,
            detect_transitions: settings.detect_transitions,
            detect_background: settings.detect_background,
            detect_repeated: settings.detect_repeated,
            detect_motion: settings.detect_motion,
            ai_assisted: settings.ai_assisted,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to start analysis");
        }

        const startData = await res.json();
        const taskId = startData.task_id;
        if (!taskId) {
          throw new Error("No task ID received from backend");
        }

        // Poll task status until complete or error
        let analysisDone = false;
        let finalResult: any = null;

        while (!analysisDone && !batchPausedRef.current) {
          await new Promise((r) => setTimeout(r, 600));
          try {
            const pollRes = await fetch(getApiEndpoint(`/api/status/${taskId}`));
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === "completed") {
                analysisDone = true;
                finalResult = pollData.result;
              } else if (pollData.status === "error") {
                throw new Error(pollData.error || "Analysis failed");
              } else if (pollData.status === "cancelled") {
                throw new Error("Analysis was cancelled");
              }
            }
          } catch (pe) {
            // Ignore brief polling blips
          }
        }

        if (batchPausedRef.current) break;

        if (finalResult && finalResult.segments) {
          const segs: Segment[] = finalResult.segments;
          const usableCount = segs.filter((s) => (s.user_override || s.action) === "KEEP").length;
          const removedCount = segs.filter((s) => (s.user_override || s.action) === "REMOVE").length;
          const itemStats = {
            totalScenes: segs.length,
            usableClips: usableCount,
            removedSlides: removedCount,
          };

          // If auto-export enabled and usable clips exist, automatically export master video
          if (autoExportBatch && usableCount > 0) {
            setBatchItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      status: "exporting",
                      progress: 90,
                      stage: "Autopilot exporting clean master video...",
                      segments: segs,
                      stats: itemStats,
                    }
                  : it
              )
            );

            try {
              const exportRes = await fetch(getApiEndpoint("/api/export"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  video_path: item.metadata.filepath,
                  segments: segs,
                  export_combined: true,
                  export_individual: false,
                  quality: exportSettings.quality,
                  include_audio: exportSettings.include_audio,
                  codec: exportSettings.codec,
                  padding_sec: exportSettings.padding_sec,
                }),
              });
              const exportData = await exportRes.json();
              setBatchItems((prev) =>
                prev.map((it) =>
                  it.id === item.id
                    ? {
                        ...it,
                        status: "exported",
                        progress: 100,
                        stage: "Completed & Clean Master Exported",
                        outputPath: exportData.combined_path,
                        segments: segs,
                        stats: itemStats,
                      }
                    : it
                )
              );
            } catch (ee) {
              setBatchItems((prev) =>
                prev.map((it) =>
                  it.id === item.id
                    ? {
                        ...it,
                        status: "completed",
                        progress: 100,
                        stage: "Analysis Completed",
                        segments: segs,
                        stats: itemStats,
                      }
                    : it
                )
              );
            }
          } else {
            setBatchItems((prev) =>
              prev.map((it) =>
                it.id === item.id
                  ? {
                      ...it,
                      status: "completed",
                      progress: 100,
                      stage: "Analysis Completed",
                      segments: segs,
                      stats: itemStats,
                    }
                  : it
              )
            );
          }
        }
      } catch (err: any) {
        setBatchItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "error", progress: 0, error: err.message } : it))
        );
      }
    }

    setIsProcessingBatch(false);
  };

  // Switch to Workspace to review this video
  const handleReviewInWorkspace = (item: BatchItem) => {
    setMetadata(item.metadata);
    if (item.segments && item.segments.length > 0) {
      setSegments(item.segments);
      setActiveSegmentId(item.segments[0].id);
      setWorkflowStep("review");
    } else {
      setWorkflowStep("import");
    }
    setActiveTab("workspace");
  };

  // Direct export trigger from batch queue
  const handleExportBatchItem = (item: BatchItem) => {
    setMetadata(item.metadata);
    if (item.segments && item.segments.length > 0) {
      setSegments(item.segments);
    }
    setIsExportModalOpen(true);
  };

  const activeSegment = useMemo(() => {
    return segments.find((s) => s.id === activeSegmentId) || null;
  }, [segments, activeSegmentId]);

  const keptClipsCount = useMemo(() => {
    return segments.filter((s) => (s.user_override || s.action) === "KEEP").length;
  }, [segments]);

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isBackendConnected={isConnected}
        batchCount={batchItems.length}
        projectCount={0}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace Content */}
      {activeTab === "workspace" && (
        <>
          {workflowStep === "import" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <UploadZone
                metadata={metadata}
                onVideoSelected={(meta) => {
                  setMetadata(meta);
                  trackEvent("video_imported", { duration_approx: Math.round(meta.duration) });
                }}
                isUploading={isUploading}
                setIsUploading={setIsUploading}
              />

              <SettingsPanel
                settings={settings}
                setSettings={setSettings}
                onStartAnalysis={handleStartAnalysis}
                isAnalyzing={false}
                isVideoLoaded={metadata !== null}
              />
            </div>
          )}

          {workflowStep === "analyzing" && (
            <ProcessingScreen
              progress={progress}
              onCancel={handleCancelAnalysis}
              isCancelling={isCancelling}
            />
          )}

          {workflowStep === "review" && metadata && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Top Review Toolbar */}
              <div
                className="glass-panel"
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setWorkflowStep("import")}
                    style={{ padding: "8px 14px" }}
                  >
                    <ArrowLeft size={16} /> Re-analyze or Choose Another
                  </button>
                  <span style={{ fontSize: "14px", fontWeight: "700" }}>{metadata.filename}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="badge badge-keep" style={{ fontSize: "13px" }}>
                    <CheckCircle2 size={14} /> {keptClipsCount} Usable Clips Preserved
                  </span>

                  {exportResult && exportResult.status === "success" ? (
                    <button
                      type="button"
                      className="btn"
                      style={{
                        padding: "10px 20px",
                        fontSize: "14px",
                        background: "rgba(16, 185, 129, 0.2)",
                        color: "#10B981",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        fontWeight: "700",
                      }}
                      onClick={() => setIsExportModalOpen(true)}
                    >
                      <CheckCircle2 size={16} /> Video Exported (View Results)
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: "10px 22px", fontSize: "14px" }}
                      onClick={() => setIsExportModalOpen(true)}
                    >
                      <Download size={16} /> Export Surviving Footage
                    </button>
                  )}
                </div>
              </div>

              {/* Video Player */}
              <VideoPlayer
                metadata={metadata}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                segments={segments}
                activeSegment={activeSegment}
                onToggleSegmentAction={handleToggleSegmentAction}
                onSplitSegment={handleSplitSegment}
                onSelectSegment={handleSelectSegment}
              />

              {/* Visual Scrubber Timeline */}
              <VisualTimeline
                duration={metadata.duration}
                segments={segments}
                currentTime={currentTime}
                activeSegmentId={activeSegmentId}
                onSelectSegment={handleSelectSegment}
                onSeek={(t) => setCurrentTime(t)}
              />

              {/* Editable Segments Table */}
              <SegmentTable
                segments={segments}
                activeSegmentId={activeSegmentId}
                onSelectSegment={handleSelectSegment}
                onToggleSegmentAction={handleToggleSegmentAction}
                onBulkAction={handleBulkAction}
                onSplitSegment={handleSplitSegment}
                currentTime={currentTime}
              />
            </div>
          )}
        </>
      )}

      {/* Batch Processing Queue View */}
      {activeTab === "batch" && (
        <BatchQueue
          batchItems={batchItems}
          setBatchItems={setBatchItems}
          onStartBatch={handleStartBatch}
          onPauseBatch={handlePauseBatch}
          isProcessingBatch={isProcessingBatch}
          onAddFiles={handleAddBatchFiles}
          autoExport={autoExportBatch}
          setAutoExport={setAutoExportBatch}
          onReviewInWorkspace={handleReviewInWorkspace}
          onExportItem={handleExportBatchItem}
        />
      )}

      {/* Recent Projects View */}
      {activeTab === "projects" && (
        <RecentProjects onLoadProject={handleLoadProject} />
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        exportSettings={exportSettings}
        setExportSettings={setExportSettings}
        onExport={handleExport}
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportResult={exportResult}
        setExportResult={setExportResult}
        keptClipsCount={keptClipsCount}
      />

      {/* Permanent Footer */}
      <footer
        style={{
          marginTop: "auto",
          padding: "20px 24px 10px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
          fontSize: "12px",
        }}
      >
        <span>Video Cleaner v1.0.0</span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#F3D079", fontWeight: "600", letterSpacing: "0.02em" }}>
          <Sparkles size={13} color="#D4AF37" /> Made by Amna
        </span>
      </footer>
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* First-Launch Analytics Consent Modal */}
      <AnalyticsConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
      />
    </div>
  );
}

export default App;
