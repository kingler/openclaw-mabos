import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceData } from "./types";

interface ReviewCardProps {
  data: WorkspaceData;
  onEdit: (section: string) => void;
}

const BMC_LABELS: Record<string, string> = {
  customer_segments: "Customer Segments",
  value_propositions: "Value Propositions",
  channels: "Channels",
  customer_relationships: "Customer Relationships",
  revenue_streams: "Revenue Streams",
  key_resources: "Key Resources",
  key_activities: "Key Activities",
  key_partners: "Key Partners",
  cost_structure: "Cost Structure",
};

function SectionHeader({
  title,
  section,
  onEdit,
}: {
  title: string;
  section: string;
  onEdit: (s: string) => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
        {title}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onEdit(section)}
        className="text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10"
      >
        <Pencil className="w-3 h-3" />
      </Button>
    </div>
  );
}

/** Summary of all onboarding data before launch. */
export function ReviewCard({ data, onEdit }: ReviewCardProps) {
  return (
    <Card className="bg-[var(--bg-card)] border-[var(--border-mabos)] max-w-lg">
      <CardContent className="pt-6 space-y-5">
        {/* Company header */}
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{data.companyName}</h3>
          <p className="text-sm text-[var(--text-muted)]">
            {data.industry} &middot; {data.stage}
          </p>
        </div>

        <Separator className="bg-[var(--border-mabos)]" />

        {/* Vision */}
        <div>
          <SectionHeader title="Vision" section="vision" onEdit={onEdit} />
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{data.vision}</p>
        </div>

        {/* Mission */}
        <div>
          <SectionHeader title="Mission" section="mission" onEdit={onEdit} />
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{data.mission}</p>
        </div>

        {/* Values */}
        {data.values.length > 0 && (
          <div>
            <SectionHeader title="Values" section="values" onEdit={onEdit} />
            <div className="flex flex-wrap gap-1.5">
              {data.values.map((v, i) => (
                <Badge
                  key={i}
                  className="bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border-[var(--accent-purple)]/20 text-xs"
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator className="bg-[var(--border-mabos)]" />

        {/* BMC blocks summary */}
        <div>
          <SectionHeader title="Business Model Canvas" section="bmc" onEdit={onEdit} />
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(BMC_LABELS).map(([key, label]) => {
              const count = (data.bmcBlocks[key] ?? []).length;
              return (
                <div
                  key={key}
                  className="border border-[var(--border-mabos)] rounded-lg p-2 text-center"
                >
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{label}</div>
                  <div className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
