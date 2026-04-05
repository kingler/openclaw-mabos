import { Building2, Users, Target, Sparkles, ArrowRight } from "lucide-react";

interface OnboardingSummaryProps {
  business?: {
    name: string;
    type?: string;
    industry?: string;
    stage: string;
    description?: string;
  };
  agents?: Array<{ id: string; name: string; role?: string; type: "core" | "domain" }>;
  goalCount?: number;
  domainAgentCount?: number;
}

export function OnboardingSummary({ business, agents, goalCount }: OnboardingSummaryProps) {
  if (!business) return null;

  const coreAgents = agents?.filter((a) => a.type === "core") ?? [];
  const domainAgents = agents?.filter((a) => a.type === "domain") ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Business Profile Card */}
      <div
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "20px",
          backgroundColor: "var(--bg-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "10px",
              backgroundColor: "color-mix(in srgb, var(--accent-purple) 15%, var(--bg-card))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={20} style={{ color: "var(--accent-purple)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
              {business.name}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              {[business.industry, business.stage, business.type]
                .filter(Boolean)
                .join(" \u00b7 ") || business.description}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          <StatCard icon={<Users size={16} />} label="Core Agents" value={coreAgents.length} />
          <StatCard
            icon={<Sparkles size={16} />}
            label="Domain Agents"
            value={domainAgents.length}
          />
          <StatCard icon={<Target size={16} />} label="Goals" value={goalCount ?? 0} />
        </div>
      </div>

      {/* Agent Roster */}
      {agents && agents.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            padding: "20px",
            backgroundColor: "var(--bg-card)",
          }}
        >
          <h4
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "12px",
            }}
          >
            Agent Team ({agents.length})
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {agents.map((agent) => (
              <span
                key={agent.id}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  backgroundColor:
                    agent.type === "core"
                      ? "color-mix(in srgb, var(--accent-blue, #3b82f6) 12%, transparent)"
                      : "color-mix(in srgb, var(--accent-purple) 12%, transparent)",
                  color:
                    agent.type === "core" ? "var(--accent-blue, #3b82f6)" : "var(--accent-purple)",
                  fontWeight: 500,
                }}
              >
                {agent.role ?? agent.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Next Steps */}
      <div
        style={{
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "20px",
          backgroundColor: "var(--bg-card)",
        }}
      >
        <h4
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "12px",
          }}
        >
          Suggested Next Steps
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <NextStepItem
            label="Connect integrations"
            description="Link Shopify, Stripe, CRM, and other tools"
          />
          <NextStepItem
            label="Review agent goals"
            description="Check generated goals and adjust priorities"
          />
          <NextStepItem
            label="Configure approval thresholds"
            description="Set budget limits and tool approval policies"
          />
          <NextStepItem
            label="Set up messaging channels"
            description="Connect Telegram, Slack, or WhatsApp for agent communication"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "8px",
        backgroundColor: "var(--bg-primary, #f9fafb)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "4px",
          color: "var(--text-secondary)",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function NextStepItem({ label, description }: { label: string; description: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background-color 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-primary, #f9fafb)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <ArrowRight size={14} style={{ color: "var(--accent-purple)", flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
          {label}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{description}</div>
      </div>
    </div>
  );
}
