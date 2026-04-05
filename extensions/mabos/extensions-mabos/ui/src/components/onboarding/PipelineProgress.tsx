import {
  Check,
  Loader2,
  AlertCircle,
  Sparkles,
  Target,
  GitBranch,
  FolderKanban,
  ListChecks,
  Zap,
  Network,
  Users,
  Brain,
} from "lucide-react";
import { useState, useEffect } from "react";

interface PipelineStage {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "running" | "completed" | "error";
}

interface PipelineProgressProps {
  isRunning: boolean;
  result?: {
    goals?: number;
    domain_agents?: number;
    error?: string;
  };
  onComplete?: () => void;
}

export function PipelineProgress({ isRunning, result, onComplete }: PipelineProgressProps) {
  const [stages, setStages] = useState<PipelineStage[]>([
    {
      id: "provision",
      label: "Provisioning core agents",
      icon: <Users size={16} />,
      status: "pending",
    },
    {
      id: "stage1",
      label: "Generating business goals",
      icon: <Target size={16} />,
      status: "pending",
    },
    {
      id: "stage2",
      label: "Refining goal hierarchy",
      icon: <GitBranch size={16} />,
      status: "pending",
    },
    {
      id: "stage3",
      label: "Scoping projects",
      icon: <FolderKanban size={16} />,
      status: "pending",
    },
    {
      id: "stage4",
      label: "Creating execution plans",
      icon: <ListChecks size={16} />,
      status: "pending",
    },
    { id: "stage5", label: "Decomposing tasks", icon: <Zap size={16} />, status: "pending" },
    {
      id: "stage6",
      label: "Mapping actions to tools",
      icon: <Network size={16} />,
      status: "pending",
    },
    {
      id: "domain",
      label: "Generating domain agents",
      icon: <Sparkles size={16} />,
      status: "pending",
    },
    {
      id: "cognitive",
      label: "Writing agent cognitive state",
      icon: <Brain size={16} />,
      status: "pending",
    },
  ]);

  // Simulate progressive stage completion when isRunning
  // In a real implementation, this would poll GET /mabos/gdc/status/:runId
  useEffect(() => {
    if (!isRunning) return;

    let currentIdx = 0;
    const stageCount = 9; // total stages
    const interval = setInterval(() => {
      setStages((prev) => {
        const updated = [...prev];
        // Complete current stage
        if (currentIdx > 0 && currentIdx <= updated.length) {
          updated[currentIdx - 1] = { ...updated[currentIdx - 1], status: "completed" };
        }
        // Start next stage
        if (currentIdx < updated.length) {
          updated[currentIdx] = { ...updated[currentIdx], status: "running" };
        }
        currentIdx++;
        return updated;
      });

      if (currentIdx > stageCount) {
        clearInterval(interval);
      }
    }, 2000); // Each stage takes ~2s in the simulation

    return () => clearInterval(interval);
  }, [isRunning]);

  // When result arrives, finalize all stages
  useEffect(() => {
    if (!result) return;

    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        status: result.error && s.status !== "completed" ? "error" : "completed",
      })),
    );

    onComplete?.();
  }, [result]);

  return (
    <div
      style={{
        border: "1px solid var(--border-default, #e5e7eb)",
        borderRadius: "12px",
        padding: "20px",
        backgroundColor: "var(--bg-card, #ffffff)",
      }}
    >
      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--text-primary, #111)",
          marginBottom: "16px",
        }}
      >
        Setting up your business...
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {stages.map((stage) => (
          <div
            key={stage.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "8px 12px",
              borderRadius: "8px",
              backgroundColor:
                stage.status === "running"
                  ? "color-mix(in srgb, var(--accent-purple, #8b5cf6) 8%, transparent)"
                  : "transparent",
              transition: "background-color 0.3s",
            }}
          >
            {/* Status icon */}
            <div
              style={{
                width: 20,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {stage.status === "completed" && (
                <Check size={16} style={{ color: "var(--accent-green, #22c55e)" }} />
              )}
              {stage.status === "running" && (
                <Loader2
                  size={16}
                  style={{
                    color: "var(--accent-purple, #8b5cf6)",
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}
              {stage.status === "error" && (
                <AlertCircle size={16} style={{ color: "var(--accent-red, #ef4444)" }} />
              )}
              {stage.status === "pending" && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "var(--text-tertiary, #d1d5db)",
                  }}
                />
              )}
            </div>

            {/* Stage icon */}
            <div
              style={{
                color:
                  stage.status === "completed"
                    ? "var(--text-secondary)"
                    : stage.status === "running"
                      ? "var(--accent-purple)"
                      : "var(--text-tertiary)",
                opacity: stage.status === "pending" ? 0.4 : 1,
              }}
            >
              {stage.icon}
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: "13px",
                color:
                  stage.status === "pending"
                    ? "var(--text-tertiary, #9ca3af)"
                    : "var(--text-primary, #111)",
                fontWeight: stage.status === "running" ? 500 : 400,
              }}
            >
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      {/* Result summary */}
      {result && !result.error && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "color-mix(in srgb, var(--accent-green, #22c55e) 10%, transparent)",
            fontSize: "13px",
            color: "var(--text-primary)",
          }}
        >
          <strong>Complete!</strong> Generated {result.goals ?? 0} goals, created{" "}
          {result.domain_agents ?? 0} domain agents.
        </div>
      )}

      {result?.error && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "color-mix(in srgb, var(--accent-red, #ef4444) 10%, transparent)",
            fontSize: "13px",
            color: "var(--text-primary)",
          }}
        >
          <strong>Note:</strong> {result.error}. Core agents were created successfully.
        </div>
      )}

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
