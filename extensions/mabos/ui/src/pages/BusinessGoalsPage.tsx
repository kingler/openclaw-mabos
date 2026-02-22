import { Target, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalDetailPanel } from "@/components/goals/GoalDetailPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoalModel } from "@/hooks/useGoalModel";
import type { BusinessGoal, GoalLevel, GoalType } from "@/lib/types";

const BUSINESS_ID = "vividwalls";

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

export function BusinessGoalsPage() {
  const { data: goalModel, isLoading, error } = useGoalModel(BUSINESS_ID);
  const [levelFilter, setLevelFilter] = useState<GoalLevel | "all">("all");
  const [typeFilter, setTypeFilter] = useState<GoalType | "all">("all");
  const [selectedGoal, setSelectedGoal] = useState<BusinessGoal | null>(null);

  // Transform the raw goal model into BusinessGoal objects
  const goals: BusinessGoal[] = useMemo(() => {
    if (!goalModel) return [];
    const model = goalModel as any;

    // Goals live inside actors[].goals (Tropos model) or at top-level .goals
    let rawGoals: any[] = model.goals || [];
    if (rawGoals.length === 0 && Array.isArray(model.actors)) {
      // Extract goals from all actors (stakeholder has the main goals)
      for (const actor of model.actors) {
        if (Array.isArray(actor.goals)) {
          for (const g of actor.goals) {
            rawGoals.push({ ...g, actor: actor.id });
          }
        }
      }
    }

    // Also enrich with goal_mapping data (agent assignments)
    const mapping = Array.isArray(model.goal_mapping) ? model.goal_mapping : [];

    return rawGoals.map((g: any, idx: number) => {
      const mapped = mapping.find((m: any) => m.stakeholder_goal === (g.goal || g.name || g.text));
      return {
        id: g.id || `goal-${idx}`,
        name: g.goal || g.text || g.name || "",
        description: g.description || mapped?.decomposition || "",
        level:
          g.level ||
          (g.priority >= 0.7 ? "strategic" : g.priority >= 0.4 ? "tactical" : "operational"),
        type:
          g.type === "hard" ? "hardgoal" : g.type === "soft" ? "softgoal" : g.type || "hardgoal",
        priority: typeof g.priority === "number" ? g.priority : 0.5,
        desires: g.desires || [],
        workflows: g.workflows || [],
      };
    });
  }, [goalModel]);

  const filtered = useMemo(() => {
    return goals.filter((g) => {
      if (levelFilter !== "all" && g.level !== levelFilter) return false;
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      return true;
    });
  }, [goals, levelFilter, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Filters */}
      {!isLoading && goals.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as GoalLevel | "all")}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-mabos)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
          >
            <option value="all">All Levels</option>
            <option value="strategic">Strategic</option>
            <option value="tactical">Tactical</option>
            <option value="operational">Operational</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as GoalType | "all")}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-mabos)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
          >
            <option value="all">All Types</option>
            <option value="hardgoal">Hard Goal</option>
            <option value="softgoal">Soft Goal</option>
            <option value="task">Task</option>
            <option value="resource">Resource</option>
          </select>
        </div>
      )}

      {/* Goals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <GoalCardSkeleton key={i} />)
          : filtered.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onSelect={(id) => {
                  const found = goals.find((g) => g.id === id);
                  if (found) setSelectedGoal(found);
                }}
              />
            ))}
      </div>

      {/* Empty state */}
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

      {/* Goal Detail Panel */}
      <GoalDetailPanel
        goal={selectedGoal}
        open={selectedGoal !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedGoal(null);
        }}
      />
    </div>
  );
}
