import type { ReactNode } from "react";

interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface ChoiceCardsProps {
  options: ChoiceOption[];
  onSelect: (value: string) => void;
  selected?: string;
}

/** Multiple choice cards for selection questions. */
export function ChoiceCards({ options, onSelect, selected }: ChoiceCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-md">
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className="border rounded-xl p-4 text-left transition-all"
            style={{
              backgroundColor: isSelected
                ? "color-mix(in srgb, var(--accent-purple) 10%, var(--bg-card))"
                : "var(--bg-card)",
              borderColor: isSelected ? "var(--accent-purple)" : "var(--border-mabos)",
            }}
          >
            {option.icon && <div className="mb-2 text-[var(--text-muted)]">{option.icon}</div>}
            <div className="text-sm font-semibold text-[var(--text-primary)]">{option.label}</div>
            {option.description && (
              <div className="text-xs text-[var(--text-muted)] mt-1">{option.description}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
