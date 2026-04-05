interface UserMessageProps {
  content: string;
}

/** User response bubble, displayed on the right side of the chat. */
export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end" style={{ animation: "fadeSlideIn 300ms ease both" }}>
      <div
        className="rounded-2xl px-4 py-2.5 max-w-[480px]"
        style={{
          backgroundColor: "color-mix(in srgb, var(--accent-purple) 20%, var(--bg-secondary))",
          border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, var(--border-mabos))",
        }}
      >
        <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">{content}</p>
      </div>
    </div>
  );
}
