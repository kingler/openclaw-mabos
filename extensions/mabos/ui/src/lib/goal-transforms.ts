import type { Phase, Milestone } from "@/components/timeline/GanttChart";
import type { TroposGoalModel } from "./types";

const phaseColors: Record<string, string> = {
  strategic: "var(--accent-purple)",
  tactical: "var(--accent-blue)",
  operational: "var(--accent-orange)",
};

const categoryMap: Record<string, string> = {
  strategic: "Strategy",
  tactical: "Execution",
  operational: "Operations",
};

export function goalsToPhases(goalModel: TroposGoalModel): Phase[] {
  const goals = (goalModel as any).goals || [];
  if (goals.length === 0) return [];

  const phases: Phase[] = [];
  let weekOffset = 0;

  // Sort by priority (highest first)
  const sorted = [...goals].sort((a: any, b: any) => (b.priority || 0.5) - (a.priority || 0.5));

  sorted.forEach((goal: any, idx: number) => {
    const level =
      goal.level ||
      (goal.priority >= 0.7 ? "strategic" : goal.priority >= 0.4 ? "tactical" : "operational");
    const duration = level === "strategic" ? 6 : level === "tactical" ? 4 : 3;
    const overlap = Math.max(0, duration - 2);

    phases.push({
      id: goal.id || `g-${idx}`,
      label: goal.text || goal.name || `Goal ${idx + 1}`,
      phase: categoryMap[level] || "Execution",
      startWeek: weekOffset,
      durationWeeks: duration,
      color: phaseColors[level] || "var(--accent-blue)",
    });

    weekOffset += duration - overlap;
  });

  return phases;
}

export function goalsToMilestones(goalModel: TroposGoalModel): Milestone[] {
  const goals = (goalModel as any).goals || [];
  if (goals.length === 0) return [];

  // High priority goals become milestones
  return goals
    .filter((g: any) => (g.priority || 0.5) >= 0.7)
    .map((g: any, idx: number) => {
      const level = g.level || "strategic";
      return {
        id: `m-${g.id || idx}`,
        label: g.text || g.name || `Milestone ${idx + 1}`,
        week: Math.max(2, idx * 4 + 4),
        color: phaseColors[level] || "var(--accent-green)",
      };
    })
    .slice(0, 5);
}

export function calculateTotalWeeks(phases: Phase[]): number {
  if (phases.length === 0) return 26;
  const maxEnd = Math.max(...phases.map((p) => p.startWeek + p.durationWeeks));
  return Math.max(26, Math.ceil(maxEnd / 4) * 4);
}

export function calculateCurrentWeek(): number {
  // Estimate current week based on current date relative to start of year
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - yearStart.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.floor(diff / weekMs);
}
