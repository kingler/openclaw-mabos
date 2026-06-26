import { Plug, Plus, CheckCircle2, XCircle, Loader2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useBusinessContext } from "@/contexts/BusinessContext";
import {
  useChannelCatalog,
  useChannels,
  useSaveChannel,
  useTestChannel,
} from "@/hooks/useChannels";
import type { ChannelDescriptor, ChannelTestResult } from "@/lib/types";

export function IntegrationsPage() {
  const { activeBusinessId } = useBusinessContext();
  const { data: channels, isLoading } = useChannels();
  const { data: catalog } = useChannelCatalog();
  const [adding, setAdding] = useState<ChannelDescriptor | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Integrations
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Connect messaging channels — no terminal required.
          </p>
        </div>
      </div>

      {adding ? (
        <ChannelForm
          descriptor={adding}
          businessId={activeBusinessId}
          onDone={() => setAdding(null)}
        />
      ) : (
        <>
          {/* Connected channels */}
          <section className="flex flex-col gap-3">
            {isLoading ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Loading channels...
              </p>
            ) : channels && channels.length > 0 ? (
              channels.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                  style={{
                    borderColor: "var(--border-mabos)",
                    backgroundColor: "var(--bg-secondary)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Plug className="h-4 w-4" style={{ color: "var(--accent-green)" }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {c.name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {c.type}
                        {c.businessId ? ` · ${c.businessId}` : ""}
                      </div>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      color: c.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                      backgroundColor: "var(--bg-tertiary)",
                    }}
                  >
                    {c.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No channels connected yet.
              </p>
            )}
          </section>

          {/* Add a channel */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Add a channel
            </h2>
            <div className="flex flex-wrap gap-3">
              {(catalog ?? []).map((d) => (
                <button
                  key={d.type}
                  onClick={() => setAdding(d)}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    borderColor: "var(--border-mabos)",
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <Plus className="h-4 w-4" /> {d.label}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ChannelForm({
  descriptor,
  businessId,
  onDone,
}: {
  descriptor: ChannelDescriptor;
  businessId: string | null;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState("");
  const [test, setTest] = useState<ChannelTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const testMut = useTestChannel();
  const saveMut = useSaveChannel();

  const setField = (name: string, value: string) =>
    setValues((v) => ({ ...v, [name]: value }));

  const runTest = async () => {
    setError(null);
    setTest(null);
    try {
      const result = await testMut.mutateAsync({
        channel_type: descriptor.type,
        credentials: values,
      });
      setTest(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const save = async () => {
    setError(null);
    try {
      const result = await saveMut.mutateAsync({
        channelType: descriptor.type,
        credentials: values,
        agentId: agentId || undefined,
        businessId: businessId || undefined,
      });
      if (result.ok) {
        onDone();
      } else {
        setError(result.error || "Failed to save channel");
      }
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div
      className="flex max-w-xl flex-col gap-4 rounded-lg border p-5"
      style={{ borderColor: "var(--border-mabos)", backgroundColor: "var(--bg-secondary)" }}
    >
      <button
        onClick={onDone}
        className="flex items-center gap-1 text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
      <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        Connect {descriptor.label}
      </h2>

      {descriptor.fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            {f.label}
            {f.required ? " *" : ""}
          </span>
          <input
            type={f.type === "password" ? "password" : "text"}
            value={values[f.name] ?? ""}
            placeholder={f.placeholder}
            onChange={(e) => setField(f.name, e.target.value)}
            className="rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border-mabos)", color: "var(--text-primary)" }}
          />
          {f.help ? (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {f.help}
            </span>
          ) : null}
        </label>
      ))}

      <label className="flex flex-col gap-1">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          Route to agent (optional)
        </span>
        <input
          type="text"
          value={agentId}
          placeholder="Agent ID that handles inbound messages"
          onChange={(e) => setAgentId(e.target.value)}
          className="rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border-mabos)", color: "var(--text-primary)" }}
        />
      </label>

      {test ? (
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: test.success ? "var(--accent-green)" : "var(--accent-red, #e5484d)" }}
        >
          {test.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {test.success ? test.error || "Connection verified" : test.error || "Test failed"}
        </div>
      ) : null}

      {error ? (
        <div className="text-sm" style={{ color: "var(--accent-red, #e5484d)" }}>
          {error}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          onClick={runTest}
          disabled={testMut.isPending}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border-mabos)", color: "var(--text-primary)" }}
        >
          {testMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Test
        </button>
        <button
          onClick={save}
          disabled={saveMut.isPending}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: "var(--accent-green)", color: "white" }}
        >
          {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save & Connect
        </button>
      </div>
    </div>
  );
}
