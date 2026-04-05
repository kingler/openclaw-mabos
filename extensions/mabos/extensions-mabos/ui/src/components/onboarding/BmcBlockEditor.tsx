import { Plus, Sparkles, Trash2, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BmcItem } from "./types";

interface BmcBlockEditorProps {
  blockKey: string;
  label: string;
  description: string;
  items: BmcItem[];
  onChange: (items: BmcItem[]) => void;
  onSuggest?: () => void;
  suggestedItems?: BmcItem[];
}

/** Editable list of BMC items for a single Business Model Canvas block. */
export function BmcBlockEditor({
  blockKey,
  label,
  description,
  items,
  onChange,
  onSuggest,
  suggestedItems,
}: BmcBlockEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  // Track accepted suggestions to avoid re-showing
  const acceptedRef = useRef(new Set<string>());

  function handleSave() {
    if (!title.trim()) return;
    const item = { title: title.trim(), description: desc.trim() };
    if (editIndex !== null) {
      const updated = [...items];
      updated[editIndex] = item;
      onChange(updated);
      setEditIndex(null);
    } else {
      onChange([...items, item]);
    }
    setTitle("");
    setDesc("");
    setShowForm(false);
  }

  function handleEdit(idx: number) {
    setTitle(items[idx].title);
    setDesc(items[idx].description);
    setEditIndex(idx);
    setShowForm(true);
  }

  function handleDelete(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function handleCancel() {
    setTitle("");
    setDesc("");
    setEditIndex(null);
    setShowForm(false);
  }

  function handleAcceptSuggestion(suggestion: BmcItem) {
    acceptedRef.current.add(suggestion.title);
    onChange([...items, suggestion]);
  }

  // Filter out already-accepted or duplicate suggestions
  const pendingSuggestions = (suggestedItems ?? []).filter(
    (s) =>
      !acceptedRef.current.has(s.title) &&
      !items.some((i) => i.title.toLowerCase() === s.title.toLowerCase()),
  );

  return (
    <div
      className="rounded-xl p-5 border border-[var(--border-mabos)] bg-[var(--bg-card)] max-w-lg"
      data-block={blockKey}
    >
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{label}</h3>
      <p className="text-xs text-[var(--text-muted)] mb-4">{description}</p>

      {/* Existing items */}
      {items.length > 0 && (
        <div className="space-y-2 mb-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="group flex items-start justify-between border border-[var(--border-mabos)] rounded-lg p-3 hover:border-[var(--accent-purple)]/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--text-primary)]">{item.title}</div>
                {item.description && (
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                    {item.description}
                  </div>
                )}
              </div>
              <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon-xs" onClick={() => handleEdit(idx)}>
                  <Pencil className="w-3 h-3 text-[var(--text-muted)]" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(idx)}>
                  <Trash2 className="w-3 h-3 text-[var(--text-muted)]" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ghost cards for AI suggestions */}
      {pendingSuggestions.length > 0 && (
        <div className="space-y-2 mb-4">
          {pendingSuggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleAcceptSuggestion(s)}
              className="w-full text-left border border-dashed border-[var(--accent-purple)]/30 rounded-lg p-3 hover:border-[var(--accent-purple)] hover:bg-[color-mix(in_srgb,var(--accent-purple)_5%,var(--bg-card))] transition-all"
            >
              <div className="text-sm font-medium text-[var(--text-secondary)]">{s.title}</div>
              {s.description && (
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{s.description}</div>
              )}
              <span className="text-xs text-[var(--accent-purple)] mt-1 inline-block">
                + Accept
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm ? (
        <div className="border border-[var(--border-mabos)] rounded-lg p-3 space-y-2 mb-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="bg-[var(--bg-secondary)] border-[var(--border-mabos)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            autoFocus
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--bg-secondary)] border-[var(--border-mabos)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/50 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/80 text-white"
            >
              {editIndex !== null ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            className="border-[var(--border-mabos)] text-[var(--text-secondary)]"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add item
          </Button>
          {onSuggest && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSuggest}
              className="text-[var(--accent-purple)] hover:text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              AI Suggest
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
