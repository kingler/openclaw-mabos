import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Sparkles,
  Target,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { AgentDetail } from "@/lib/types";
import type { LucideIcon } from "lucide-react";

type BdiViewerProps = {
  agent: AgentDetail;
};

type BdiSection = {
  key: "beliefs" | "desires" | "goals" | "intentions";
  label: string;
  icon: LucideIcon;
  color: string;
  countKey: "beliefCount" | "desireCount" | "goalCount" | "intentionCount";
};

const sections: BdiSection[] = [
  {
    key: "beliefs",
    label: "Beliefs",
    icon: Brain,
    color: "var(--accent-blue)",
    countKey: "beliefCount",
  },
  {
    key: "desires",
    label: "Desires",
    icon: Sparkles,
    color: "var(--accent-purple)",
    countKey: "desireCount",
  },
  {
    key: "goals",
    label: "Goals",
    icon: Target,
    color: "var(--accent-green)",
    countKey: "goalCount",
  },
  {
    key: "intentions",
    label: "Intentions",
    icon: Zap,
    color: "var(--accent-orange)",
    countKey: "intentionCount",
  },
];

function BdiSection({
  section,
  items,
  count,
}: {
  section: BdiSection;
  items: string[];
  count: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const Icon = section.icon;

  return (
    <div
      className="rounded-lg border border-[var(--border-mabos)] overflow-hidden"
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: section.color,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md"
            style={{
              backgroundColor: `color-mix(in srgb, ${section.color} 15%, transparent)`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color: section.color }} />
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {section.label}
          </span>
          <Badge
            variant="outline"
            className="border-[var(--border-mabos)] text-[var(--text-secondary)] text-[10px] px-1.5 py-0"
          >
            {count}
          </Badge>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
        )}
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-2 bg-[var(--bg-card)]">
          {items.length > 0 ? (
            items.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: section.color }}
                />
                <span>{item}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--text-muted)] italic">
              No {section.label.toLowerCase()} recorded
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function BdiViewer({ agent }: BdiViewerProps) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <BdiSection
          key={section.key}
          section={section}
          items={agent[section.key]}
          count={agent[section.countKey]}
        />
      ))}
    </div>
  );
}
