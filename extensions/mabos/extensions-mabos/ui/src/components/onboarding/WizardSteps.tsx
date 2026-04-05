import { Loader2, Rocket, Sparkles, Building2, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { BmcBlockEditor } from "./BmcBlockEditor";
import { ChoiceCards } from "./ChoiceCards";
import { InlineForm } from "./InlineForm";
import { NeoMessage } from "./NeoMessage";
import { ReviewCard } from "./ReviewCard";
import { StepsOverview } from "./StepsOverview";
import { SuggestionCards } from "./SuggestionCards";
import type { BmcItem, FormField, WorkspaceData } from "./types";
import { UserMessage } from "./UserMessage";

// ---------- Step types ----------

type OnboardingStep =
  | "welcome"
  | "company"
  | "vision"
  | "mission"
  | "values"
  | "bmc_customer_segments"
  | "bmc_value_propositions"
  | "bmc_channels"
  | "bmc_customer_relationships"
  | "bmc_revenue_streams"
  | "bmc_key_resources"
  | "bmc_key_activities"
  | "bmc_key_partners"
  | "bmc_cost_structure"
  | "review"
  | "complete";

const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "company",
  "vision",
  "mission",
  "values",
  "bmc_customer_segments",
  "bmc_value_propositions",
  "bmc_channels",
  "bmc_customer_relationships",
  "bmc_revenue_streams",
  "bmc_key_resources",
  "bmc_key_activities",
  "bmc_key_partners",
  "bmc_cost_structure",
  "review",
  "complete",
];

const STEP_LABELS = [
  "Welcome",
  "Company",
  "Vision",
  "Mission",
  "Values",
  "Customer Segments",
  "Value Propositions",
  "Channels",
  "Customer Relationships",
  "Revenue Streams",
  "Key Resources",
  "Key Activities",
  "Key Partners",
  "Cost Structure",
  "Review",
  "Launch",
];

const BMC_STEPS: {
  step: OnboardingStep;
  key: string;
  label: string;
  neoIntro: string;
}[] = [
  {
    step: "bmc_customer_segments",
    key: "customer_segments",
    label: "Customer Segments",
    neoIntro:
      "Now let's map your business model. First: **Customer Segments** — who are your most important customers?",
  },
  {
    step: "bmc_value_propositions",
    key: "value_propositions",
    label: "Value Propositions",
    neoIntro: "Next: **Value Propositions** — what value do you deliver?",
  },
  {
    step: "bmc_channels",
    key: "channels",
    label: "Channels",
    neoIntro: "**Channels** — how do you reach your customers?",
  },
  {
    step: "bmc_customer_relationships",
    key: "customer_relationships",
    label: "Customer Relationships",
    neoIntro: "**Customer Relationships** — how do you acquire and retain customers?",
  },
  {
    step: "bmc_revenue_streams",
    key: "revenue_streams",
    label: "Revenue Streams",
    neoIntro: "**Revenue Streams** — how does your business make money?",
  },
  {
    step: "bmc_key_resources",
    key: "key_resources",
    label: "Key Resources",
    neoIntro: "**Key Resources** — what assets does your business need?",
  },
  {
    step: "bmc_key_activities",
    key: "key_activities",
    label: "Key Activities",
    neoIntro: "**Key Activities** — what must your company do to succeed?",
  },
  {
    step: "bmc_key_partners",
    key: "key_partners",
    label: "Key Partners",
    neoIntro: "**Key Partners** — who are your strategic allies?",
  },
  {
    step: "bmc_cost_structure",
    key: "cost_structure",
    label: "Cost Structure",
    neoIntro: "Last BMC block! **Cost Structure** — what are your biggest costs?",
  },
];

interface ChatMessage {
  id: string;
  role: "neo" | "user";
  content: string;
  component?: ReactNode;
}

// ---------- Helpers ----------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

let msgCounter = 0;
function nextId(): string {
  return `msg-${++msgCounter}-${Date.now()}`;
}

const COMPANY_FIELDS: FormField[] = [
  {
    name: "name",
    label: "Company Name",
    type: "text",
    required: true,
    placeholder: "e.g. Acme Corporation",
  },
  {
    name: "industry",
    label: "Industry",
    type: "text",
    required: true,
    placeholder: "e.g. SaaS, E-Commerce, Consulting",
  },
  {
    name: "stage",
    label: "Business Stage",
    type: "select",
    required: true,
    options: ["Pre-revenue", "Early", "Growth", "Scaling", "Mature"],
  },
];

// ---------- Main component ----------

export function WizardSteps() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceData>({
    businessType: "",
    companyName: "",
    businessId: "",
    industry: "",
    stage: "",
    vision: "",
    mission: "",
    values: [],
    bmcBlocks: {},
  });

  // Suggestion state for text steps (vision/mission/values)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  // Suggestion state for BMC steps
  const [bmcSuggestions, setBmcSuggestions] = useState<BmcItem[]>([]);

  // Launch state
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{
    agents_created: number;
    goals_generated: number;
  } | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  const stepIndex = STEP_ORDER.indexOf(currentStep);
  const completedSteps = Array.from({ length: stepIndex }, (_, i) => i);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, isTyping]);

  // Append a Neo message with a typing delay
  const addNeoMessage = useCallback((content: string, component?: ReactNode) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: nextId(), role: "neo", content, component }]);
    }, 400);
  }, []);

  // Append a user message
  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content }]);
  }, []);

  // Initialize with welcome
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    addNeoMessage(
      "Welcome! I'm **Neo**, your MABOS Business Assistant. Let's set up your AI-powered business operating system.\n\nFirst, what type of business are you building?",
      <ChoiceCards
        options={[
          {
            value: "new",
            label: "New Business",
            description: "Starting from scratch",
            icon: <Plus className="w-5 h-5" />,
          },
          {
            value: "existing",
            label: "Existing Business",
            description: "Already operational",
            icon: <Building2 className="w-5 h-5" />,
          },
        ]}
        onSelect={handleWelcomeChoice}
      />,
    );
  }, []);

  // Build the workspace context in the format the backend expects
  function buildSuggestContext() {
    return {
      company_name: workspace.companyName,
      industry: workspace.industry,
      stage: workspace.stage,
      vision: workspace.vision || undefined,
      mission: workspace.mission || undefined,
      values: workspace.values.length > 0 ? workspace.values : undefined,
      bmc_blocks: Object.keys(workspace.bmcBlocks).length > 0 ? workspace.bmcBlocks : undefined,
    };
  }

  // Fetch AI suggestions for text fields
  async function fetchSuggestion(suggestType: string) {
    setSuggestLoading(true);
    setSuggestions([]);
    try {
      const res = (await api.onboardSuggest({
        suggest_type: suggestType,
        workspace_context: buildSuggestContext(),
      })) as { suggestions?: string[] };
      setSuggestions(res.suggestions ?? []);
    } catch {
      setSuggestions(["Could not generate suggestions. Please enter manually."]);
    } finally {
      setSuggestLoading(false);
    }
  }

  // Fetch BMC suggestions
  async function fetchBmcSuggestion(blockKey: string) {
    setSuggestLoading(true);
    setBmcSuggestions([]);
    try {
      const res = (await api.onboardSuggest({
        suggest_type: "bmc_block",
        bmc_block_key: blockKey,
        workspace_context: buildSuggestContext(),
      })) as { suggestions?: Array<{ title: string; description: string }> };
      setBmcSuggestions(
        (res.suggestions ?? []).map((s) =>
          typeof s === "string" ? { title: s, description: "" } : s,
        ),
      );
    } catch {
      // Silently ignore
    } finally {
      setSuggestLoading(false);
    }
  }

  function advanceTo(step: OnboardingStep) {
    setCurrentStep(step);
    setSuggestions([]);
    setSuggestLoading(false);
    setBmcSuggestions([]);
  }

  // ---------- Step handlers ----------

  function handleWelcomeChoice(value: string) {
    const label = value === "new" ? "New Business" : "Existing Business";
    setWorkspace((prev) => ({ ...prev, businessType: value }));
    addUserMessage(label);
    advanceTo("company");
    setTimeout(() => {
      addNeoMessage(
        "Great choice! Tell me about your business.",
        <InlineForm fields={COMPANY_FIELDS} onSubmit={handleCompanySubmit} />,
      );
    }, 500);
  }

  function handleCompanySubmit(values: Record<string, string>) {
    const name = values.name ?? "";
    setWorkspace((prev) => ({
      ...prev,
      companyName: name,
      businessId: slugify(name),
      industry: values.industry ?? "",
      stage: values.stage ?? "",
    }));
    addUserMessage(`${name} — ${values.industry}, ${values.stage}`);
    advanceTo("vision");
    setTimeout(() => {
      showVisionStep();
    }, 500);
  }

  function showVisionStep() {
    addNeoMessage(
      "What's your vision for the future? Describe the impact your business will have.",
      <VisionMissionForm
        placeholder="e.g. To become the world's most trusted platform for..."
        onSubmit={(v) => handleTextSubmit("vision", v)}
        onSuggest={() => fetchSuggestion("vision")}
      />,
    );
  }

  function showMissionStep() {
    addNeoMessage(
      "What's your core mission? What do you do day-to-day to achieve your vision?",
      <VisionMissionForm
        placeholder="e.g. We empower small businesses by providing..."
        onSubmit={(v) => handleTextSubmit("mission", v)}
        onSuggest={() => fetchSuggestion("mission")}
      />,
    );
  }

  function showValuesStep() {
    addNeoMessage(
      "What values define your company culture? Enter them separated by commas.",
      <VisionMissionForm
        placeholder="e.g. Innovation, Integrity, Customer-first, Transparency"
        onSubmit={(v) => handleTextSubmit("values", v)}
        onSuggest={() => fetchSuggestion("values")}
      />,
    );
  }

  function handleTextSubmit(field: "vision" | "mission" | "values", value: string) {
    if (!value.trim()) return;
    addUserMessage(value);
    if (field === "values") {
      const vals = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      setWorkspace((prev) => ({ ...prev, values: vals }));
    } else {
      setWorkspace((prev) => ({ ...prev, [field]: value }));
    }

    // Advance to next step
    const nextStepMap: Record<string, { step: OnboardingStep; show: () => void }> = {
      vision: { step: "mission", show: () => setTimeout(showMissionStep, 500) },
      mission: { step: "values", show: () => setTimeout(showValuesStep, 500) },
      values: { step: "bmc_customer_segments", show: () => setTimeout(() => showBmcStep(0), 500) },
    };
    const next = nextStepMap[field];
    if (next) {
      advanceTo(next.step);
      next.show();
    }
  }

  function handleSuggestionAccept(value: string) {
    // Determine which step we're on and fill the value
    if (currentStep === "vision") {
      setWorkspace((prev) => ({ ...prev, vision: value }));
      addUserMessage(value);
      advanceTo("mission");
      setTimeout(showMissionStep, 500);
    } else if (currentStep === "mission") {
      setWorkspace((prev) => ({ ...prev, mission: value }));
      addUserMessage(value);
      advanceTo("values");
      setTimeout(showValuesStep, 500);
    } else if (currentStep === "values") {
      const vals = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      setWorkspace((prev) => ({ ...prev, values: vals }));
      addUserMessage(value);
      advanceTo("bmc_customer_segments");
      setTimeout(() => showBmcStep(0), 500);
    }
    setSuggestions([]);
  }

  // ---------- BMC steps ----------

  function showBmcStep(bmcIndex: number) {
    const cfg = BMC_STEPS[bmcIndex];
    if (!cfg) return;
    addNeoMessage(cfg.neoIntro, <BmcStepComponent bmcIndex={bmcIndex} />);
  }

  function BmcStepComponent({ bmcIndex }: { bmcIndex: number }) {
    const cfg = BMC_STEPS[bmcIndex];
    if (!cfg) return null;
    const items = workspace.bmcBlocks[cfg.key] ?? [];

    return (
      <div className="space-y-3">
        <BmcBlockEditor
          blockKey={cfg.key}
          label={cfg.label}
          description={`Add items for ${cfg.label}`}
          items={items}
          onChange={(updated) => {
            setWorkspace((prev) => ({
              ...prev,
              bmcBlocks: { ...prev.bmcBlocks, [cfg.key]: updated },
            }));
          }}
          onSuggest={() => fetchBmcSuggestion(cfg.key)}
          suggestedItems={bmcSuggestions}
        />
        <Button
          onClick={() => handleBmcContinue(bmcIndex)}
          className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/80 text-white"
        >
          Continue
        </Button>
      </div>
    );
  }

  function handleBmcContinue(bmcIndex: number) {
    const cfg = BMC_STEPS[bmcIndex];
    if (!cfg) return;
    const items = workspace.bmcBlocks[cfg.key] ?? [];
    const summary =
      items.length > 0
        ? `${cfg.label}: ${items.map((i) => i.title).join(", ")}`
        : `${cfg.label}: (skipped)`;
    addUserMessage(summary);

    const nextBmc = bmcIndex + 1;
    if (nextBmc < BMC_STEPS.length) {
      advanceTo(BMC_STEPS[nextBmc].step);
      setTimeout(() => showBmcStep(nextBmc), 500);
    } else {
      advanceTo("review");
      setTimeout(showReviewStep, 500);
    }
  }

  // ---------- Review & Launch ----------

  function showReviewStep() {
    addNeoMessage(
      "Here's everything we've captured. Review your details and click **Launch** when ready.",
      <div className="space-y-4">
        <ReviewCard data={workspace} onEdit={handleReviewEdit} />
        <Button
          onClick={handleLaunch}
          className="bg-[var(--accent-green)] hover:bg-[var(--accent-green)]/80 text-black font-semibold px-8 h-11"
        >
          <Rocket className="w-4 h-4 mr-2" />
          Launch Business
        </Button>
      </div>,
    );
  }

  function handleReviewEdit(section: string) {
    // Map section to step for jump-back
    const sectionMap: Record<string, OnboardingStep> = {
      company: "company",
      vision: "vision",
      mission: "mission",
      values: "values",
      bmc: "bmc_customer_segments",
    };
    const target = sectionMap[section];
    if (target) {
      advanceTo(target);
      // Re-show the appropriate step
      if (target === "vision") setTimeout(showVisionStep, 300);
      else if (target === "mission") setTimeout(showMissionStep, 300);
      else if (target === "values") setTimeout(showValuesStep, 300);
      else if (target === "bmc_customer_segments") setTimeout(() => showBmcStep(0), 300);
      else if (target === "company") {
        setTimeout(() => {
          addNeoMessage(
            "Let's update your company details.",
            <InlineForm fields={COMPANY_FIELDS} onSubmit={handleCompanySubmit} />,
          );
        }, 300);
      }
    }
  }

  async function handleLaunch() {
    advanceTo("complete");
    setLaunching(true);
    setLaunchError(null);
    addUserMessage("Launch my business!");

    setTimeout(() => {
      addNeoMessage(
        "Launching your business...",
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-purple)]" />
          <span className="text-sm text-[var(--text-secondary)]">
            Creating agents, generating goals, setting up your workspace...
          </span>
        </div>,
      );
    }, 300);

    try {
      const payload = {
        business_id: workspace.businessId,
        name: workspace.companyName,
        type: workspace.businessType,
        industry: workspace.industry,
        stage: workspace.stage,
        vision: workspace.vision,
        mission: workspace.mission,
        values: workspace.values,
        bmc: workspace.bmcBlocks,
      };
      const res = (await api.onboard(payload)) as {
        ok: boolean;
        business_id: string;
        agents_created?: string[];
        goals_generated?: number;
      };
      const agentCount = res.agents_created?.length ?? 9;
      const goalCount = res.goals_generated ?? 0;
      setLaunchResult({ agents_created: agentCount, goals_generated: goalCount });

      setTimeout(() => {
        addNeoMessage(
          `Your business is live! **${agentCount}** agents created${goalCount > 0 ? `, **${goalCount}** goals generated` : ""}.\n\nYour MABOS-powered business **${workspace.companyName}** is ready to go.`,
          <a
            href={`/mabos/dashboard`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: "var(--accent-purple)" }}
          >
            <Rocket className="w-4 h-4" />
            Go to Dashboard
          </a>,
        );
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLaunchError(msg);
      setTimeout(() => {
        addNeoMessage(
          `Something went wrong: ${msg}\n\nPlease try again or contact support.`,
          <Button
            onClick={() => {
              advanceTo("review");
              setTimeout(showReviewStep, 300);
            }}
            className="bg-[var(--accent-red)] hover:bg-[var(--accent-red)]/80 text-white"
          >
            Go back to Review
          </Button>,
        );
      }, 400);
    } finally {
      setLaunching(false);
    }
  }

  // ---------- Render ----------

  return (
    <div className="flex gap-6">
      {/* Sidebar progress */}
      <div className="hidden lg:block shrink-0">
        <StepsOverview
          steps={STEP_LABELS}
          currentStep={stepIndex}
          completedSteps={completedSteps}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 min-w-0">
        <div
          ref={scrollRef}
          className="space-y-6 overflow-y-auto pr-2"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        >
          {messages.map((msg) =>
            msg.role === "neo" ? (
              <NeoMessage key={msg.id} content={msg.content} component={msg.component} />
            ) : (
              <UserMessage key={msg.id} content={msg.content} />
            ),
          )}
          {isTyping && <NeoMessage content="" isTyping />}

          {/* Show suggestion cards for text steps */}
          {(currentStep === "vision" || currentStep === "mission" || currentStep === "values") &&
            (suggestLoading || suggestions.length > 0) && (
              <SuggestionCards
                suggestions={suggestions}
                loading={suggestLoading}
                onAccept={handleSuggestionAccept}
                onDismiss={() => setSuggestions([])}
              />
            )}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-component: text entry with AI suggest ----------

function VisionMissionForm({
  placeholder,
  onSubmit,
  onSuggest,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  onSuggest: () => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="rounded-xl border border-[var(--border-mabos)] bg-[var(--bg-card)] p-5 max-w-lg">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-md border px-3 py-2 text-sm bg-[var(--bg-secondary)] border-[var(--border-mabos)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-purple)]/50 resize-none"
      />
      <div className="flex gap-2 mt-3 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSuggest}
          className="text-[var(--accent-purple)] hover:text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          AI Suggest
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSubmit(value)}
          disabled={!value.trim()}
          className="bg-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/80 text-white"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
