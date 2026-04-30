import { Rocket } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePanels } from "@/contexts/PanelContext";
import { useInitiatives } from "@/hooks/useInitiatives";
import type { Initiative } from "@/lib/types";

const statusOptions = ["all", "active", "planned", "completed", "paused"] as const;

const statusColor: Record<string, string> = {
  active: "var(--accent-green)",
  planned: "var(--accent-blue)",
  completed: "var(--accent-purple)",
  paused: "var(--accent-amber)",
};

export function InitiativesPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const { data, isLoading } = useInitiatives(
    statusFilter !== "all" ? { status: statusFilter } : undefined,
  );
  const { openDetailPanel } = usePanels();

  const initiatives = data?.initiatives ?? [];
  const activeCount = initiatives.filter((i) => i.status === "active").length;
  const completedCount = initiatives.filter((i) => i.status === "completed").length;
  const totalCampaigns = initiatives.reduce((sum, i) => sum + i.campaignCount, 0);

  function handleRowClick(initiative: Initiative) {
    openDetailPanel("initiative", initiative.id, initiative);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent-blue) 15%, var(--bg-card))",
          }}
        >
          <Rocket className="w-5 h-5 text-[var(--accent-blue)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Initiatives</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Strategic initiatives linking projects to campaigns
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: initiatives.length },
          { label: "Active", value: activeCount },
          { label: "Completed", value: completedCount },
          { label: "Campaigns", value: totalCampaigns },
        ].map((stat) => (
          <Card
            key={stat.label}
            className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none"
          >
            <CardContent className="p-3">
              <p className="text-xs text-[var(--text-secondary)]">{stat.label}</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border-[var(--border-mabos)] bg-[var(--bg-card)] shadow-none">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
              Initiatives
            </CardTitle>
            <select
              className="text-xs px-2 py-1 rounded border border-[var(--border-mabos)] bg-[var(--bg-secondary)] text-[var(--text-primary)]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : initiatives.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-8 text-center">
              No initiatives found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-mabos)]">
                    <th className="text-left py-2 pr-4 text-[var(--text-secondary)] font-medium">
                      Name
                    </th>
                    <th className="text-left py-2 pr-4 text-[var(--text-secondary)] font-medium">
                      Status
                    </th>
                    <th className="text-left py-2 pr-4 text-[var(--text-secondary)] font-medium">
                      Category
                    </th>
                    <th className="text-right py-2 pr-4 text-[var(--text-secondary)] font-medium">
                      Priority
                    </th>
                    <th className="text-right py-2 pr-4 text-[var(--text-secondary)] font-medium">
                      Goals
                    </th>
                    <th className="text-right py-2 text-[var(--text-secondary)] font-medium">
                      Campaigns
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {initiatives.map((initiative) => (
                    <tr
                      key={initiative.id}
                      onClick={() => handleRowClick(initiative)}
                      className="border-b border-[var(--border-mabos)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        <span className="text-[var(--text-primary)] font-medium">
                          {initiative.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: statusColor[initiative.status] ?? "var(--border-mabos)",
                            color: statusColor[initiative.status] ?? "var(--text-secondary)",
                          }}
                        >
                          {initiative.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                        {initiative.category || "-"}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[var(--text-primary)]">
                        {initiative.priority}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[var(--text-secondary)]">
                        {initiative.goals.length}
                      </td>
                      <td className="py-2.5 text-right text-[var(--text-secondary)]">
                        {initiative.campaignCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
