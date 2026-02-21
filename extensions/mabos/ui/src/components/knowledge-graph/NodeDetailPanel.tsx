import type { Node } from "@xyflow/react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type NodeDetailPanelProps = {
  node: Node | null;
  onClose: () => void;
};

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  if (!node) return null;

  const isActor = node.type === "actorNode";
  const data = node.data as any;

  return (
    <div className="absolute right-4 top-4 w-72 bg-[var(--bg-card)] border border-[var(--border-mabos)] rounded-lg shadow-lg z-20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border-mabos)]">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">
          {isActor ? "Actor" : "Goal"} Details
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        <div>
          <p className="text-xs text-[var(--text-muted)]">Name</p>
          <p className="text-sm text-[var(--text-primary)]">{data.label}</p>
        </div>

        {isActor ? (
          <>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Type</p>
              <Badge
                variant="outline"
                className="text-[10px] capitalize border-[var(--border-mabos)] text-[var(--text-secondary)] mt-0.5"
              >
                {data.type}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Goals</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {data.goalCount} goal{data.goalCount !== 1 ? "s" : ""}
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Level</p>
              <Badge
                variant="outline"
                className="text-[10px] capitalize border-[var(--border-mabos)] text-[var(--text-secondary)] mt-0.5"
              >
                {data.level}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Type</p>
              <Badge
                variant="outline"
                className="text-[10px] capitalize border-[var(--border-mabos)] text-[var(--text-secondary)] mt-0.5"
              >
                {data.type}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Priority</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-tertiary)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent-blue)]"
                    style={{ width: `${(data.priority || 0.5) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {((data.priority || 0.5) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Actor</p>
              <p className="text-sm text-[var(--text-secondary)] capitalize">{data.actor}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
