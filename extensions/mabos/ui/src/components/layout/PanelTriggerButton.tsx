import { PanelLeftOpen, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePanels } from "@/contexts/PanelContext";

type PanelTriggerButtonProps = {
  side: "left" | "right";
};

export function PanelTriggerButton({ side }: PanelTriggerButtonProps) {
  const { sidebarOpen, chatOpen, openSidebar, openChat } = usePanels();

  const isLeft = side === "left";
  const hidden = isLeft ? sidebarOpen : chatOpen;
  const Icon = isLeft ? PanelLeftOpen : MessageSquare;
  const label = isLeft ? "Open sidebar (Ctrl+B)" : "Open chat (Ctrl+J)";
  const onClick = isLeft ? openSidebar : openChat;

  if (hidden) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`fixed top-1/2 -translate-y-1/2 z-[60] flex items-center justify-center w-8 h-12 bg-[var(--bg-secondary)] border border-[var(--border-mabos)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors ${
              isLeft ? "left-0 rounded-r-lg border-l-0" : "right-0 rounded-l-lg border-r-0"
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isLeft ? "right" : "left"}>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
