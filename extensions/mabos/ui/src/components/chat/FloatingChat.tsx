import { useRouterState } from "@tanstack/react-router";
import {
  SendHorizontal,
  Sparkles,
  Minus,
  Brain,
  Search,
  ScanSearch,
  Database,
  Workflow,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatState } from "@/contexts/ChatContext";
import { usePanels } from "@/contexts/PanelContext";
import { useChat } from "@/hooks/useChat";
import type { AgentActivity } from "@/hooks/useChat";
import { useChatActionDispatcher } from "@/lib/chat-actions";
import { getPageContext } from "@/lib/page-context";
import { AgentSelector } from "./AgentSelector";
import { ChatMessage } from "./ChatMessage";
import { CollapsedChatButton } from "./CollapsedChatButton";

const pageSuggestions: Record<string, string[]> = {
  "/": ["Show system overview", "Any urgent decisions?"],
  "/decisions": [
    "Summarize pending decisions",
    "Show critical decisions only",
    "Approve recommended decisions",
  ],
  "/goals": ["Show at-risk goals", "Update goal progress", "Create strategic goal"],
  "/projects": ["Show blocked tasks", "Reassign overdue tasks", "Create new task"],
  "/agents": ["Agent health check", "Trigger BDI cycle for all", "Show idle agents"],
  "/workflows": ["Show stalled workflows", "Restart paused workflow"],
  "/knowledge-graph": ["Show key dependencies", "Find disconnected nodes"],
  "/timeline": ["Overdue milestones", "Next week's deadlines"],
  "/performance": ["Refresh KPIs", "Compare month-over-month"],
  "/inventory": ["Low stock alerts", "Reorder suggestions"],
  "/accounting": ["Revenue summary", "Overdue invoices"],
  "/hr": ["Team workload balance", "Open positions status"],
};

function getSuggestions(pathname: string): string[] {
  const basepath = "/mabos/dashboard";
  const relative = pathname.startsWith(basepath)
    ? pathname.slice(basepath.length) || "/"
    : pathname;
  return pageSuggestions[relative] || pageSuggestions["/"] || [];
}

function AgentActivityIndicator({ activity }: { activity: AgentActivity }) {
  const config = {
    thinking: { icon: Brain, label: "Thinking" },
    analyzing: { icon: ScanSearch, label: "Analyzing" },
    searching: { icon: Search, label: "Searching" },
    retrieving: { icon: Database, label: "Retrieving" },
    reasoning: { icon: Workflow, label: "Reasoning" },
  };
  const { icon: Icon, label } = config[activity.status as keyof typeof config] ?? config.thinking;
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Icon className="w-4 h-4 text-[var(--accent-purple)] animate-pulse" />
      <span className="text-xs text-[var(--text-muted)] animate-pulse">
        {activity.label || label}...
      </span>
    </div>
  );
}

export function FloatingChat() {
  const { isMinimized, minimizeChat, setLastActiveAgent } = useChatState();
  const { isPanelExpanded } = usePanels();
  const { dispatchAction } = useChatActionDispatcher();
  const routerState = useRouterState();
  const pageCtx = getPageContext(routerState.location.pathname);

  const { messages, status, activeAgent, setActiveAgent, sendMessage, agentActivity } = useChat(
    "default",
    {
      onAction: dispatchAction,
    },
  );

  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const suggestions = getSuggestions(routerState.location.pathname);

  const statusColor = {
    connected: "bg-[var(--accent-green)]",
    connecting: "bg-[var(--accent-orange)]",
    disconnected: "bg-[var(--accent-red)]",
  }[status];

  // Sync activeAgent to ChatContext for collapsed button
  useEffect(() => {
    setLastActiveAgent(activeAgent);
  }, [activeAgent, setLastActiveAgent]);

  // Attach scroll listener to ScrollArea viewport to track user scroll position
  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) return;
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;

    function onScroll() {
      if (!viewport) return;
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isUserScrolledUpRef.current = distanceFromBottom > 40;
    }

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!isUserScrolledUpRef.current && scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, agentActivity.status]);

  function handleSend(text?: string) {
    const msg = text || input;
    if (!msg.trim()) return;
    sendMessage(msg, { page: pageCtx.pageId, capabilities: pageCtx.capabilities });
    setInput("");
    // Force scroll to bottom on send
    isUserScrolledUpRef.current = false;
    requestAnimationFrame(() => {
      scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestionClick(suggestion: string) {
    handleSend(suggestion);
  }

  if (isMinimized) {
    return <CollapsedChatButton />;
  }

  return (
    <div
      className={`fixed bottom-[40px] left-1/2 -translate-x-1/2 ${isPanelExpanded ? "z-[60]" : "z-[30]"} w-[calc(100vw-48px)] md:max-w-[800px] max-[480px]:max-w-[calc(100%-24px)] max-[480px]:bottom-[20px]`}
    >
      {/* Unified chat container */}
      <div
        className="flex flex-col rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-mabos)] overflow-hidden h-[min(480px,60vh)] md:h-[min(480px,60vh)] max-[768px]:h-[min(400px,70vh)] max-[480px]:h-[min(360px,80vh)] focus-within:border-[var(--accent-purple)] focus-within:ring-2 focus-within:ring-[var(--accent-purple)]/30 transition-shadow"
        style={{ boxShadow: "0 0 40px rgba(0, 0, 0, 0.15)" }}
      >
        {/* Top toolbar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-mabos)] shrink-0">
          {/* Agent selector */}
          <AgentSelector activeAgent={activeAgent} onSelect={setActiveAgent} />

          {/* Connection status dot */}
          <div className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} title={status} />

          {/* Suggestions toggle */}
          <button
            onClick={() => setShowSuggestions((s) => !s)}
            className={`p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors shrink-0 ${showSuggestions ? "text-[var(--accent-purple)]" : "text-[var(--text-muted)] hover:text-[var(--accent-purple)]"}`}
            aria-label="Toggle suggestions"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Minimize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              minimizeChat();
            }}
            className="relative z-10 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0 ml-auto"
            aria-label="Minimize chat"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable message thread */}
        <div ref={scrollAreaRef} className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">
                    Message your agents to get started
                  </p>
                </div>
              ) : (
                messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
              )}
              {agentActivity.status && <AgentActivityIndicator activity={agentActivity} />}
              <div ref={scrollAnchorRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Suggestions row (toggled by Sparkles) */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="p-2 border-t border-[var(--border-mabos)] shrink-0">
            <div className="flex items-center px-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Suggestions
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="px-3 py-1.5 text-xs rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="relative border-t border-[var(--border-mabos)] shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message your agents..."
            className="w-full resize-none px-3 py-2 pr-14 text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none min-h-[44px] max-h-[80px]"
            rows={1}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="absolute bottom-2 right-2 flex items-center justify-center w-9 h-9 rounded-[5px] bg-[var(--accent-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
            aria-label="Send message"
          >
            <SendHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
