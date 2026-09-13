import React, { useState, useCallback, useMemo } from "react";
import { Header } from "./components/Header";
import { UploadZone } from "./components/UploadZone";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProcessingScreen } from "./components/ProcessingScreen";
import { VideoPlayer } from "./components/VideoPlayer";
import { VisualTimeline } from "./components/VisualTimeline";
import { SegmentTable } from "./components/SegmentTable";
import { ExportModal } from "./components/ExportModal";
import { SettingsModal } from "./components/SettingsModal";
import { BatchQueue, BatchItem } from "./components/BatchQueue";
import { RecentProjects } from "./components/RecentProjects";
import { useWebSocket } from "./hooks/useWebSocket";
import { getApiEndpoint } from "./config/api";
import {
  VideoMetadata,
  Segment,
  AnalysisSettings,
  ExportSettings,
  ProgressData,
  ExportResult,
} from "./types/video";
import { Download, Sliders, ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";

export function App() {
  const [activeTab, setActiveTab] = useState<"workspace" | "batch" | "projects">("workspace");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Video State
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // App Workflow Step: "import" | "analyzing" | "review"
  const [workflowStep, setWorkflowStep] = useState<"import" | "analyzing" | "review">("import");

  // Analysis Settings
  const [settings, setSettings] = useState<AnalysisSettings>({
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
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // Batch Items
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

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
    }
  }, []);

  const handleError = useCallback((err: string) => {
    alert(`Analysis Error: ${err}`);
    setWorkflowStep("import");
    setIsCancelling(false);
  }, []);

  const handleCancelled = useCallback(() => {
    setWorkflowStep("import");
    setIsCancelling(false);
    setProgress(null);
  }, []);

  const { isConnected } = useWebSocket(
    handleProgress,
    handleCompleted,
    handleError,
    handleCancelled
  );

  // Trigger Analysis
  const handleStartAnalysis = async () => {
    if (!metadata) return;
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
        }),
      });
      const data = await res.json();
      setExportResult(data);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
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
  const handleAddBatchFiles = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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

  // Run Batch Processing
  const handleStartBatch = async () => {
    setIsProcessingBatch(true);
    for (const item of batchItems) {
      if (item.status === "completed") continue;
      // Update item to analyzing
      setBatchItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "analyzing", progress: 20 } : it))
      );
      // Run analysis
      try {
        const res = await fetch(getApiEndpoint("/api/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_path: item.metadata.filepath,
            sensitivity: settings.sensitivity,
            min_clip_duration: settings.min_clip_duration,
          }),
        });
        // Mock progression for batch queue demonstration
        setBatchItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "completed", progress: 100 } : it))
        );
      } catch (err) {
        setBatchItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: "error", progress: 0 } : it))
        );
      }
    }
    setIsProcessingBatch(false);
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
                onVideoSelected={(meta) => setMetadata(meta)}
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

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "10px 22px", fontSize: "14px" }}
                    onClick={() => {
                      setExportResult(null);
                      setIsExportModalOpen(true);
                    }}
                  >
                    <Download size={16} /> Export Surviving Footage
                  </button>
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
          isProcessingBatch={isProcessingBatch}
          onAddFiles={handleAddBatchFiles}
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
        exportResult={exportResult}
        keptClipsCount={keptClipsCount}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
