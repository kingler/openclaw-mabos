import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormField } from "./types";

interface InlineFormProps {
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => void;
  submitLabel?: string;
}

/** Dynamic form renderer for onboarding steps. */
export function InlineForm({ fields, onSubmit, submitLabel = "Continue" }: InlineFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      init[f.name] = "";
    }
    return init;
  });

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[var(--border-mabos)] bg-[var(--bg-card)] p-5 max-w-lg"
    >
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {field.label}
              {field.required && <span className="text-[var(--accent-red)]"> *</span>}
            </label>

            {field.type === "text" && (
              <Input
                value={values[field.name] ?? ""}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="bg-[var(--bg-secondary)] border-[var(--border-mabos)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            )}

            {field.type === "textarea" && (
              <textarea
                value={values[field.name] ?? ""}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--bg-secondary)] border-[var(--border-mabos)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/50 resize-none"
              />
            )}

            {field.type === "select" && field.options && (
              <select
                value={values[field.name] ?? ""}
                onChange={(e) => handleChange(field.name, e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--bg-secondary)] border-[var(--border-mabos)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/50"
              >
                <option value="">{field.placeholder ?? "Select..."}</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          type="submit"
          className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/80 text-white"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
