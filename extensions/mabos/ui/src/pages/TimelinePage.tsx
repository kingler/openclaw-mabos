import { Calendar, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { GanttChart } from "@/components/timeline/GanttChart";
import { useGoals } from "@/hooks/useGoals";

const BUSINESS_ID = "vividwalls";

// Legend items matching the design token colors used in the Gantt chart
const legendItems = [
  { label: "Foundation", color: "var(--accent-blue)" },
  { label: "Growth", color: "var(--accent-green)" },
  { label: "Optimization", color: "var(--accent-purple)" },
  { label: "Launch", color: "var(--accent-orange)" },
  { label: "Milestone", color: "var(--accent-green)", isMilestone: true },
  { label: "Current Week", color: "var(--accent-green)", isIndicator: true },
];

// Summary stats for the header area
const stats = [
  { label: "Total Phases", value: "7" },
  { label: "Milestones", value: "3" },
  { label: "Timeline", value: "26 weeks" },
  { label: "Current Week", value: "8" },
];

export function TimelinePage() {
  const { isLoading, error } = useGoals(BUSINESS_ID);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, var(--accent-blue) 15%, transparent)`,
          }}
        >
          <Calendar className="w-5 h-5 text-[var(--accent-blue)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Timeline
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {isLoading
              ? "Loading timeline..."
              : "Project roadmap, phases, and milestones"}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[color-mix(in_srgb,var(--accent-red)_10%,var(--bg-card))] border border-[var(--accent-red)]/20">
          <AlertCircle className="w-5 h-5 text-[var(--accent-red)] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Failed to load goals
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Unable to fetch goal data from the API. Showing default timeline.
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none"
          >
            <CardContent className="py-3 px-4">
              <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
              <p className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gantt Chart */}
      <Card className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
              Project Roadmap
            </CardTitle>
            <Badge
              variant="outline"
              className="border-[var(--accent-green)]/30 text-[var(--accent-green)] text-[10px]"
            >
              Week 8 of 26
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full bg-[var(--bg-secondary)]" />
              <Skeleton className="h-6 w-3/4 bg-[var(--bg-secondary)]" />
              <Skeleton className="h-40 w-full bg-[var(--bg-secondary)]" />
              <Skeleton className="h-6 w-3/4 bg-[var(--bg-secondary)]" />
              <Skeleton className="h-32 w-full bg-[var(--bg-secondary)]" />
              <Skeleton className="h-6 w-3/4 bg-[var(--bg-secondary)]" />
              <Skeleton className="h-24 w-full bg-[var(--bg-secondary)]" />
            </div>
          ) : (
            <GanttChart currentWeek={8} />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
            Legend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {legendItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                {item.isMilestone ? (
                  <span
                    className="inline-block w-2.5 h-2.5 rotate-45"
                    style={{ backgroundColor: item.color }}
                  />
                ) : item.isIndicator ? (
                  <span
                    className="inline-block w-0.5 h-4 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                ) : (
                  <span
                    className="inline-block w-4 h-2.5 rounded-sm"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${item.color} 40%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${item.color} 60%, transparent)`,
                    }}
                  />
                )}
                <span className="text-xs text-[var(--text-muted)]">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <Separator className="my-3 bg-[var(--border-mabos)]" />

          <p className="text-[10px] text-[var(--text-muted)]">
            Bars show phase duration with progress fill. Diamond markers indicate
            key milestones. The green vertical line marks the current week.
            Hover over any item for details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
