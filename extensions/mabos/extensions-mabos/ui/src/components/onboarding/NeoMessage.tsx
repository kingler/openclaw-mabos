import { Bot } from "lucide-react";
import type { ReactNode } from "react";

interface NeoMessageProps {
  content: string;
  component?: ReactNode;
  isTyping?: boolean;
}

/** AI assistant message bubble, displayed on the left side of the chat. */
export function NeoMessage({ content, component, isTyping }: NeoMessageProps) {
  return (
    <div className="flex gap-3 max-w-[620px]" style={{ animation: "fadeSlideIn 400ms ease both" }}>
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent-purple) 15%, var(--bg-card))",
        }}
      >
        <Bot className="w-4 h-4 text-[var(--accent-purple)]" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Name line */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-medium text-[var(--text-primary)]">MABOS</span>
          <span className="text-xs text-[var(--text-muted)]">Business Assistant</span>
        </div>

        {/* Typing indicator */}
        {isTyping ? (
          <div className="flex items-center gap-1 py-2">
            <span
              className="w-2 h-2 rounded-full bg-[var(--text-muted)]"
              style={{ animation: "typingDot 1.4s ease-in-out 0s infinite" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-[var(--text-muted)]"
              style={{ animation: "typingDot 1.4s ease-in-out 0.2s infinite" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-[var(--text-muted)]"
              style={{ animation: "typingDot 1.4s ease-in-out 0.4s infinite" }}
            />
          </div>
        ) : (
          <>
            {/* Markdown-lite content */}
            <div
              className="text-[15px] leading-relaxed text-[var(--text-primary)]"
              dangerouslySetInnerHTML={{
                __html: content
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\n/g, "<br />"),
              }}
            />

            {/* Optional embedded component */}
            {component && <div className="mt-4">{component}</div>}
          </>
        )}
      </div>
    </div>
  );
}
