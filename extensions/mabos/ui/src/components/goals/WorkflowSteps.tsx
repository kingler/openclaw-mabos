import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Workflow, WorkflowStatus } from "@/lib/types";

const statusColors: Record<WorkflowStatus, string> = {
  active: "var(--accent-green)",
  completed: "var(--accent-blue)",
  paused: "var(--accent-orange)",
  pending: "var(--text-muted)",
};

type WorkflowStepsProps = {
  workflow: Workflow;
};

export function WorkflowSteps({ workflow }: WorkflowStepsProps) {
  const sortedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);
  const statusColor = statusColors[workflow.status];

  return (
    <Card className="bg-[var(--bg-secondary)] border-[var(--border-mabos)]">
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-primary)]">{workflow.name}</p>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] capitalize"
              style={{
                borderColor: `color-mix(in srgb, ${statusColor} 40%, transparent)`,
                color: statusColor,
              }}
            >
              {workflow.status}
            </Badge>
            {workflow.agents.length > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                {workflow.agents.join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Step flow */}
        <div className="flex items-center gap-1 flex-wrap">
          {sortedSteps.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-1">
              <span className="px-2 py-0.5 text-[10px] rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] whitespace-nowrap">
                {step.name}
              </span>
              {idx < sortedSteps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
