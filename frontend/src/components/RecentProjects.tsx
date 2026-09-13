import React, { useEffect, useState } from "react";
import { History, Folder, Film, ArrowRight, RefreshCw, FileText } from "lucide-react";
import { getApiEndpoint } from "../config/api";

interface ProjectItem {
  project_name: string;
  source_video: string;
  created_at: number;
  surviving_clips: number;
  analysis_file: string;
}

interface RecentProjectsProps {
  onLoadProject: (analysisFile: string) => void;
}

export const RecentProjects: React.FC<RecentProjectsProps> = ({ onLoadProject }) => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = () => {
    setLoading(true);
    fetch(getApiEndpoint("/api/projects"))
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) setProjects(data.projects);
      })
      .catch((err) => console.warn("Failed to fetch projects:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <History size={22} color="#D4AF37" />
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Recent Cleaned Projects</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Reload previous analysis states instantly without re-processing
            </p>
          </div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={fetchProjects} style={{ padding: "8px 14px" }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)", border: "2px dashed var(--border-subtle)", borderRadius: "10px" }}>
          <History size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
          <p style={{ fontSize: "14px", fontWeight: "600" }}>No saved projects yet</p>
          <p style={{ fontSize: "12px", marginTop: "4px" }}>When you analyze and export videos, they will appear here</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
          {projects.map((proj) => (
            <div
              key={proj.project_name}
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                padding: "16px 20px",
                borderRadius: "10px",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Film size={18} color="#D4AF37" />
                <span style={{ fontSize: "14px", fontWeight: "700", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {proj.project_name}
                </span>
              </div>

              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Source: <span className="mono" style={{ color: "var(--text-primary)" }}>{proj.source_video.split(/[/\\]/).pop()}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px", fontSize: "12px" }}>
                <span className="badge badge-keep">{proj.surviving_clips} Usable Clips</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {new Date(proj.created_at * 1000).toLocaleDateString()}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "100%", marginTop: "6px", fontSize: "12px", justifyContent: "center" }}
                onClick={() => onLoadProject(proj.analysis_file)}
              >
                <FileText size={14} /> Open Saved Project <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
