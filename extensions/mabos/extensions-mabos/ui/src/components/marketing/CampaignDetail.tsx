import {
  BarChart3,
  Calendar,
  DollarSign,
  Expand,
  Eye,
  MousePointerClick,
  Shrink,
  Target,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCampaignMetrics } from "@/hooks/useMarketing";
import type { MarketingCampaign, CampaignMetrics } from "@/lib/types";

const statusColors: Record<string, string> = {
  active: "var(--accent-green)",
  paused: "var(--accent-orange)",
  completed: "var(--accent-blue)",
  draft: "var(--text-muted)",
};

interface CampaignDetailProps {
  campaign: MarketingCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-mabos)]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color: color || "var(--text-muted)" }} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <p className="text-lg font-semibold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function BudgetBar({ budget, spent }: { budget: number; spent: number }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const overBudget = spent > budget && budget > 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--text-secondary)]">${spent.toLocaleString()} spent</span>
        <span className="text-[var(--text-muted)]">${budget.toLocaleString()} budget</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: overBudget ? "var(--accent-red)" : "var(--accent-green)",
          }}
        />
      </div>
      <p
        className="text-[10px] mt-1"
        style={{ color: overBudget ? "var(--accent-red)" : "var(--text-muted)" }}
      >
        {pct.toFixed(0)}% of budget used{overBudget ? " (over budget)" : ""}
      </p>
    </div>
  );
}

function MetricsSection({ metrics, isLoading }: { metrics?: CampaignMetrics; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <p className="text-xs text-[var(--text-muted)] py-4 text-center">
        No performance metrics available yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard
        icon={Eye}
        label="Impressions"
        value={metrics.impressions?.toLocaleString() ?? "0"}
        color="var(--accent-blue)"
      />
      <MetricCard
        icon={MousePointerClick}
        label="Clicks"
        value={metrics.clicks?.toLocaleString() ?? "0"}
        sub={`${(metrics.ctr ?? 0).toFixed(2)}% CTR`}
        color="var(--accent-purple)"
      />
      <MetricCard
        icon={Target}
        label="Conversions"
        value={metrics.conversions?.toLocaleString() ?? "0"}
        sub={`${(metrics.conversion_rate ?? 0).toFixed(2)}% rate`}
        color="var(--accent-green)"
      />
      <MetricCard
        icon={DollarSign}
        label="CPA"
        value={`$${(metrics.cost_per_acquisition ?? 0).toFixed(2)}`}
        color="var(--accent-orange)"
      />
      <MetricCard
        icon={TrendingUp}
        label="ROAS"
        value={`${(metrics.roi ?? 0).toFixed(1)}x`}
        color="var(--accent-green)"
      />
      <MetricCard
        icon={BarChart3}
        label="Revenue"
        value={`$${((metrics as any).revenue_attributed ?? 0).toLocaleString()}`}
        color="var(--accent-blue)"
      />
    </div>
  );
}

export function CampaignDetail({ campaign, open, onOpenChange }: CampaignDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: metrics, isLoading: metricsLoading } = useCampaignMetrics(
    open && campaign ? campaign.id : null,
  );

  if (!campaign) return null;

  const statusColor = statusColors[campaign.status] ?? "var(--text-muted)";

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setExpanded(false);
      }}
    >
      <SheetContent
        side="right"
        className={`bg-[var(--bg-primary)] overflow-y-auto border-l border-[var(--border-mabos)] transition-[max-width] duration-300 ${
          expanded ? "w-full sm:max-w-2xl" : "w-full sm:max-w-md"
        }`}
      >
        <SheetHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className="text-[10px] font-semibold uppercase tracking-wider border-current"
                style={{ color: statusColor }}
              >
                {campaign.status}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold uppercase tracking-wider border-[var(--border-mabos)] text-[var(--text-secondary)]"
              >
                {campaign.type}
              </Badge>
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={expanded ? "Collapse" : "Expand to full view"}
            >
              {expanded ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
            </button>
          </div>
          <SheetTitle className="text-lg text-[var(--text-primary)]">{campaign.name}</SheetTitle>
          <SheetDescription className="text-[var(--text-secondary)]">
            Campaign {campaign.id}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 space-y-6 pb-6">
          {/* Budget */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Budget
            </h4>
            <BudgetBar budget={campaign.budget} spent={campaign.spent} />
          </div>

          <Separator className="bg-[var(--border-mabos)]" />

          {/* Channels */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Channels
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {campaign.channels.length > 0 ? (
                campaign.channels.map((ch) => (
                  <Badge
                    key={ch}
                    variant="outline"
                    className="text-xs border-[var(--border-mabos)] text-[var(--text-secondary)]"
                  >
                    {ch}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-[var(--text-muted)]">No channels assigned</p>
              )}
            </div>
          </div>

          <Separator className="bg-[var(--border-mabos)]" />

          {/* Dates */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Schedule
            </h4>
            <div className="flex items-center gap-4">
              {campaign.start_date ? (
                <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  {new Date(campaign.start_date).toLocaleDateString()}
                </div>
              ) : null}
              {campaign.end_date ? (
                <>
                  <span className="text-[var(--text-muted)]">-</span>
                  <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                    <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {new Date(campaign.end_date).toLocaleDateString()}
                  </div>
                </>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">No end date</span>
              )}
            </div>
          </div>

          <Separator className="bg-[var(--border-mabos)]" />

          {/* Performance Metrics */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Performance
            </h4>
            <MetricsSection metrics={metrics} isLoading={metricsLoading} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
