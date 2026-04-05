import { Check } from "lucide-react";

interface StepsOverviewProps {
  steps: string[];
  currentStep: number;
  completedSteps: number[];
}

/** Vertical step progress indicator with checkmarks for completed steps. */
export function StepsOverview({ steps, currentStep, completedSteps }: StepsOverviewProps) {
  const completedSet = new Set(completedSteps);

  return (
    <div className="rounded-xl border border-[var(--border-mabos)] bg-[var(--bg-card)] p-5 max-w-xs">
      <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">
        Progress
      </h4>
      <div className="space-y-1">
        {steps.map((label, idx) => {
          const isCompleted = completedSet.has(idx);
          const isCurrent = idx === currentStep;
          const isUpcoming = !isCompleted && !isCurrent;

          return (
            <div key={idx} className="flex items-center gap-3 py-1.5">
              {/* Step indicator */}
              {isCompleted ? (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--accent-green)" }}
                >
                  <Check className="w-3 h-3 text-white" />
                </div>
              ) : isCurrent ? (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2"
                  style={{ borderColor: "var(--accent-purple)" }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--accent-purple)" }}
                  />
                </div>
              ) : (
                <div
                  className="w-5 h-5 rounded-full border shrink-0"
                  style={{ borderColor: "var(--border-mabos)" }}
                />
              )}

              {/* Label */}
              <span
                className="text-sm"
                style={{
                  color: isCurrent
                    ? "var(--text-primary)"
                    : isCompleted
                      ? "var(--text-secondary)"
                      : "var(--text-muted)",
                  fontWeight: isCurrent ? 500 : 400,
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
