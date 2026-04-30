import { Link } from "@tanstack/react-router";
import { Target, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Initiative } from "@/lib/types";

const statusColor: Record<string, string> = {
  active: "var(--accent-green)",
  planned: "var(--accent-blue)",
  completed: "var(--accent-purple)",
  paused: "var(--accent-amber)",
};

type InitiativeDetailPanelProps = {
  initiative: Initiative | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetSide?: "right" | "bottom";
};

export function InitiativeDetailPanel({
  initiative,
  open,
  onOpenChange,
  sheetSide = "right",
}: InitiativeDetailPanelProps) {
  if (!initiative) return null;

  const borderColor = statusColor[initiative.status] ?? "var(--border-mabos)";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={sheetSide}
        className={`bg-[var(--bg-primary)] overflow-y-auto ${sheetSide === "bottom" ? "h-[85vh] border-t" : "w-full sm:max-w-lg border-l"} border-[var(--border-mabos)]`}
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="text-lg text-[var(--text-primary)]">{initiative.name}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-2 pt-1">
              <Badge
                variant="outline"
                className="text-[10px] capitalize"
                style={{
                  borderColor: `color-mix(in srgb, ${borderColor} 40%, transparent)`,
                  color: borderColor,
                }}
              >
                {initiative.status}
              </Badge>
              {initiative.category && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-[var(--border-mabos)] text-[var(--text-muted)]"
                >
                  {initiative.category}
                </Badge>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <Separator className="bg-[var(--border-mabos)]" />
        </div>

        <div className="px-4 flex-1">
          <Tabs defaultValue="overview">
            <TabsList className="bg-[var(--bg-secondary)]">
              <TabsTrigger
                value="overview"
                className="text-[var(--text-secondary)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-tertiary)]"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="goals"
                className="text-[var(--text-secondary)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-tertiary)]"
              >
                Goals
              </TabsTrigger>
              <TabsTrigger
                value="campaigns"
                className="text-[var(--text-secondary)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-tertiary)]"
              >
                Campaigns
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 pt-2">
              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-1">Description</p>
                <p className="text-sm text-[var(--text-primary)]">
                  {initiative.description || "No description"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Priority</p>
                  <p className="text-sm text-[var(--text-primary)] font-medium">
                    {initiative.priority}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Campaign Count</p>
                  <p className="text-sm text-[var(--text-primary)] font-medium">
                    {initiative.campaignCount}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals" className="space-y-2 pt-2">
              {initiative.goals.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
                  No linked goals
                </p>
              ) : (
                initiative.goals.map((goalId) => (
                  <Link
                    key={goalId}
                    to="/goals"
                    className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors text-left"
                  >
                    <Target className="w-4 h-4 text-[var(--accent-purple)] shrink-0" />
                    <span className="text-sm text-[var(--text-primary)] truncate">{goalId}</span>
                  </Link>
                ))
              )}
            </TabsContent>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns" className="space-y-2 pt-2">
              {initiative.campaignCount === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
                  No linked campaigns
                </p>
              ) : (
                <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
                  <Megaphone className="w-4 h-4 inline mr-1" />
                  {initiative.campaignCount} campaign{initiative.campaignCount !== 1 ? "s" : ""}{" "}
                  linked — view in Marketing page
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
