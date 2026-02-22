import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { BusinessGoal, GoalLevel } from "@/lib/types";
import { WorkflowSteps } from "./WorkflowSteps";

const levelColors: Record<GoalLevel, string> = {
  strategic: "var(--accent-purple)",
  tactical: "var(--accent-blue)",
  operational: "var(--accent-orange)",
};

type GoalCardProps = {
  goal: BusinessGoal;
  onSelect?: (goalId: string) => void;
};

export function GoalCard({ goal, onSelect }: GoalCardProps) {
  const borderColor = levelColors[goal.level];

  return (
    <Card
      className="bg-[var(--bg-card)] border-[var(--border-mabos)] py-4 cursor-pointer hover:border-[var(--border-hover)] transition-colors"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
      onClick={() => onSelect?.(goal.id)}
    >
      <CardContent className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{goal.name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant="outline"
              className="text-[10px] capitalize"
              style={{
                borderColor: `color-mix(in srgb, ${borderColor} 40%, transparent)`,
                color: borderColor,
              }}
            >
              {goal.level}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] border-[var(--border-mabos)] text-[var(--text-muted)]"
            >
              {goal.type}
            </Badge>
          </div>
        </div>

        {/* Priority */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)]">Priority</span>
          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-tertiary)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${goal.priority * 100}%`,
                backgroundColor: borderColor,
              }}
            />
          </div>
          <span className="text-[10px] text-[var(--text-secondary)]">
            {(goal.priority * 100).toFixed(0)}%
          </span>
        </div>

        {/* Description */}
        {goal.description && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{goal.description}</p>
        )}

        {/* Desires */}
        {goal.desires && goal.desires.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {goal.desires.map((desire) => (
              <span
                key={desire}
                className="px-2 py-0.5 text-[10px] rounded-full text-[var(--accent-purple)]"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--accent-purple) 10%, transparent)`,
                }}
              >
                {desire}
              </span>
            ))}
          </div>
        )}

        {/* Workflows */}
        {goal.workflows && goal.workflows.length > 0 && (
          <div className="space-y-2 pt-1">
            {goal.workflows.map((workflow) => (
              <WorkflowSteps key={workflow.id} workflow={workflow} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
