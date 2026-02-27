import { Target, AlertCircle, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalModelDiagram } from "@/components/goals/GoalModelDiagram";
import { GoalPerspectiveSelector } from "@/components/goals/GoalPerspectiveSelector";
import { GoalViewToggle, type GoalViewMode } from "@/components/goals/GoalViewToggle";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePanels } from "@/contexts/PanelContext";
import { useGoalModel } from "@/hooks/useGoalModel";
import type { BusinessGoal, GoalLevel, GoalPerspective, GoalState, GoalType } from "@/lib/types";

const BUSINESS_ID = "vividwalls";

/* ─── Banner Ring Chart ─── */
function BannerRingChart({ value, size = 120 }: { value: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * value;
  const gap = circumference - filled;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="block -rotate-90">
        <defs>
          <linearGradient id="banner-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent-blue)" />
            <stop offset="100%" stopColor="var(--accent-green)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-mabos)"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#banner-ring-grad)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute font-bold text-white" style={{ fontSize: 32 }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/* ─── Tab Bar ─── */
type TabBarProps<T extends string> = {
  tabs: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
};

function TabBar<T extends string>({ tabs, active, onChange }: TabBarProps<T>) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`px-4 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-all ${
            active === tab.value
              ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Skeleton ─── */
function GoalCardSkeleton() {
  return (
    <Card className="bg-[var(--bg-card)] border-[var(--border-mabos)] py-4">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  );
}

/* ─── Level tabs ─── */
const levelTabs: { value: GoalLevel | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "strategic", label: "Strategic" },
  { value: "tactical", label: "Tactical" },
  { value: "operational", label: "Operational" },
];

/* ─── Type tabs (Tropos + BDI) ─── */
const typeTabs: { value: GoalType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hardgoal", label: "Hard Goal" },
  { value: "softgoal", label: "Soft Goal" },
  { value: "task", label: "Task" },
  { value: "resource", label: "Resource" },
  { value: "achieve" as GoalType, label: "Achieve" },
  { value: "maintain" as GoalType, label: "Maintain" },
  { value: "cease" as GoalType, label: "Cease" },
  { value: "avoid" as GoalType, label: "Avoid" },
  { value: "query" as GoalType, label: "Query" },
];

/* ─── State tabs ─── */
const stateTabs: { value: GoalState | "all"; label: string }[] = [
  { value: "all", label: "All States" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "in_progress", label: "In Progress" },
  { value: "achieved", label: "Achieved" },
  { value: "failed", label: "Failed" },
  { value: "suspended", label: "Suspended" },
  { value: "abandoned", label: "Abandoned" },
];

/* ════════════════════════════════════════════════════════ */

export function BusinessGoalsPage() {
  const { data: goalModel, isLoading, error } = useGoalModel(BUSINESS_ID);
  const [levelFilter, setLevelFilter] = useState<GoalLevel | "all">("all");
  const [typeFilter, setTypeFilter] = useState<GoalType | "all">("all");
  const [stateFilter, setStateFilter] = useState<GoalState | "all">("all");
  const [viewMode, setViewMode] = useState<GoalViewMode>("grid");
  const [perspective, setPerspective] = useState<GoalPerspective>("level");
  const { openDetailPanel } = usePanels();

  // Transform the raw goal model into BusinessGoal objects
  const goals: BusinessGoal[] = useMemo(() => {
    if (!goalModel) return [];

    let rawGoals = goalModel.goals ?? [];
    if (rawGoals.length === 0 && Array.isArray(goalModel.actors)) {
      const extracted: BusinessGoal[] = [];
      for (const actor of goalModel.actors) {
        if (Array.isArray(actor.goals)) {
          for (const gId of actor.goals) {
            extracted.push({
              id: typeof gId === "string" ? gId : `goal-${extracted.length}`,
              name: typeof gId === "string" ? gId : "",
              description: "",
              level: "tactical",
              type: "hardgoal",
              priority: 0.5,
              actor: actor.id,
              desires: [],
              workflows: [],
            });
          }
        }
      }
      rawGoals = extracted;
    }

    return rawGoals.map((g, idx) => ({
      id: g.id || `goal-${idx}`,
      name: g.text ?? g.name ?? "",
      description: g.description ?? "",
      level:
        g.level ||
        (g.priority >= 0.7 ? "strategic" : g.priority >= 0.4 ? "tactical" : "operational"),
      type: g.type || "hardgoal",
      priority: typeof g.priority === "number" ? g.priority : 0.5,
      desires: g.desires ?? [],
      workflows: g.workflows ?? [],
      category: g.category,
      domain: g.domain,
      parentGoalId: g.parentGoalId,
      actor: g.actor,
      goalState: (g as any).goalState ?? undefined,
    }));
  }, [goalModel]);

  const filtered = useMemo(() => {
    return goals.filter((g) => {
      if (levelFilter !== "all" && g.level !== levelFilter) return false;
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      if (stateFilter !== "all" && (g.goalState ?? "active") !== stateFilter) return false;
      return true;
    });
  }, [goals, levelFilter, typeFilter, stateFilter]);

  // Banner stats
  const avgPriority =
    goals.length > 0 ? goals.reduce((sum, g) => sum + g.priority, 0) / goals.length : 0;
  const strategicCount = goals.filter((g) => g.level === "strategic").length;
  const tacticalCount = goals.filter((g) => g.level === "tactical").length;
  const operationalCount = goals.filter((g) => g.level === "operational").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{
              backgroundColor: `color-mix(in srgb, var(--accent-purple) 15%, transparent)`,
            }}
          >
            <Target className="w-5 h-5 text-[var(--accent-purple)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Business Goals</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {goals.length > 0
                ? `${goals.length} goal${goals.length !== 1 ? "s" : ""} across all levels`
                : isLoading
                  ? "Loading goals..."
                  : "Tropos goal model and workflow visualization"}
            </p>
          </div>
        </div>

        {/* View toggle */}
        {!isLoading && goals.length > 0 && (
          <GoalViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        )}
      </div>

      {/* ─── Banner ─── */}
      {!isLoading && goals.length > 0 && (
        <div
          className="w-full rounded-xl overflow-hidden"
          style={{
            height: 200,
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)",
          }}
        >
          <div className="flex items-center justify-between h-full px-8">
            {/* Left: Ring chart */}
            <div className="flex items-center gap-8">
              <BannerRingChart value={avgPriority} />
              <div className="space-y-1">
                <p className="text-white/60 text-sm font-medium">Average Priority</p>
                <p className="text-white text-3xl font-bold">{(avgPriority * 100).toFixed(0)}%</p>
                <p className="text-white/50 text-xs">Across {goals.length} business goals</p>
              </div>
            </div>

            {/* Right: Quick stats */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white/10 backdrop-blur-sm">
                <TrendingUp className="w-5 h-5 text-purple-300" />
                <div>
                  <p className="text-white text-lg font-bold">{strategicCount}</p>
                  <p className="text-white/50 text-xs">Strategic</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white/10 backdrop-blur-sm">
                <CheckCircle2 className="w-5 h-5 text-blue-300" />
                <div>
                  <p className="text-white text-lg font-bold">{tacticalCount}</p>
                  <p className="text-white/50 text-xs">Tactical</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white/10 backdrop-blur-sm">
                <Clock className="w-5 h-5 text-orange-300" />
                <div>
                  <p className="text-white text-lg font-bold">{operationalCount}</p>
                  <p className="text-white/50 text-xs">Operational</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[color-mix(in_srgb,var(--accent-red)_10%,var(--bg-card))] border border-[var(--accent-red)]/20">
          <AlertCircle className="w-5 h-5 text-[var(--accent-red)] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Failed to load goals</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Unable to fetch goal model from the API. Please try again later.
            </p>
          </div>
        </div>
      )}

      {/* ─── Tab Bar Filters ─── */}
      {!isLoading && goals.length > 0 && (
        <div className="space-y-2">
          <TabBar tabs={levelTabs} active={levelFilter} onChange={setLevelFilter} />
          <TabBar tabs={typeTabs} active={typeFilter} onChange={setTypeFilter} />
          <TabBar tabs={stateTabs} active={stateFilter} onChange={setStateFilter} />
        </div>
      )}

      {/* Perspective selector (diagram mode only) */}
      {viewMode === "diagram" && !isLoading && goals.length > 0 && (
        <GoalPerspectiveSelector
          perspective={perspective}
          onPerspectiveChange={setPerspective}
          goalModel={goalModel}
        />
      )}

      {/* Content area */}
      {viewMode === "grid" ? (
        <>
          {/* Goals Grid — 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <GoalCardSkeleton key={i} />)
              : filtered.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onSelect={(id) => {
                      const found = goals.find((g) => g.id === id);
                      if (found) openDetailPanel("goal", found.id, found);
                    }}
                  />
                ))}
          </div>

          {/* Empty state (grid) */}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="text-center py-12">
              <Target className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-sm text-[var(--text-secondary)]">
                {goals.length > 0
                  ? "No goals match the current filters."
                  : "No goals defined yet. Use the onboarding wizard to set business goals."}
              </p>
            </div>
          )}
        </>
      ) : (
        /* Diagram view */
        <GoalModelDiagram
          goalModel={goalModel!}
          goals={goals}
          isLoading={isLoading}
          levelFilter={levelFilter}
          typeFilter={typeFilter}
          perspective={perspective}
        />
      )}
    </div>
  );
}
