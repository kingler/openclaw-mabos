import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface SuggestionCardsProps {
  suggestions: string[];
  onAccept: (value: string) => void;
  onDismiss: () => void;
  loading?: boolean;
}

/** Display AI-generated suggestions with accept/dismiss actions. */
export function SuggestionCards({
  suggestions,
  onAccept,
  onDismiss,
  loading,
}: SuggestionCardsProps) {
  if (loading) {
    return (
      <div className="space-y-3 max-w-md">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="inline-block w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
          Generating suggestions...
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border border-[var(--border-mabos)] rounded-lg p-4 bg-[var(--bg-card)]"
          >
            <Skeleton className="h-4 w-3/4 mb-2 bg-[var(--bg-tertiary)]" />
            <Skeleton className="h-3 w-full bg-[var(--bg-tertiary)]" />
          </div>
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="max-w-md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          Suggestions
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="space-y-2">
        {suggestions.map((text, idx) => (
          <div
            key={idx}
            className="border border-[var(--border-mabos)] rounded-lg p-3 bg-[var(--bg-card)] flex items-start justify-between gap-3 hover:border-[var(--accent-purple)]/40 transition-colors"
          >
            <p className="text-sm text-[var(--text-primary)] leading-relaxed flex-1">{text}</p>
            <Button
              size="xs"
              onClick={() => onAccept(text)}
              className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/80 text-white shrink-0"
            >
              <Check className="w-3 h-3 mr-1" />
              Use
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
