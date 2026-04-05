import { useNavigate } from "@tanstack/react-router";
import { Building2, Plus, Users, ArrowRight, Cpu, Rocket } from "lucide-react";
import { useBusinessContext } from "@/contexts/BusinessContext";
import type { Business } from "@/lib/types";

/** Onboarding progress stored in the business manifest by the backend. */
interface OnboardingProgress {
  currentStep?: string;
  completedSteps?: number;
  totalSteps?: number;
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const { businesses, isLoading, setActiveBusinessId } = useBusinessContext();

  function handleSelectBusiness(biz: Business) {
    // If onboarding is incomplete, resume it
    const progress = (biz as any).onboardingProgress as OnboardingProgress | undefined;
    if (
      progress &&
      progress.completedSteps !== undefined &&
      progress.totalSteps !== undefined &&
      progress.completedSteps < progress.totalSteps
    ) {
      setActiveBusinessId(biz.id);
      navigate({ to: "/onboarding" });
      return;
    }
    setActiveBusinessId(biz.id);
    navigate({ to: "/overview" });
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-mabos)] px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Cpu className="w-7 h-7 text-[var(--accent-green)]" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">MABOS</h1>
          <span className="text-sm text-[var(--text-secondary)] ml-2">
            Multi-Agent Business Operating System
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Your Businesses</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Select a business to manage or create a new one
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 rounded-xl border border-[var(--border-mabos)] bg-[var(--bg-card)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Business cards */}
            {businesses.map((business) => (
              <BusinessCard
                key={business.id}
                business={business}
                onSelect={() => handleSelectBusiness(business)}
              />
            ))}

            {/* New Business card */}
            <button
              type="button"
              onClick={() => navigate({ to: "/onboarding" })}
              className="group rounded-xl border-2 border-dashed border-[var(--border-mabos)] bg-transparent p-6 hover:border-[var(--accent-purple)] hover:bg-[color-mix(in_srgb,var(--accent-purple)_5%,transparent)] transition-all cursor-pointer flex flex-col items-center justify-center text-center min-h-[200px]"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent-purple) 12%, var(--bg-card))",
                }}
              >
                <Plus className="w-6 h-6 text-[var(--accent-purple)]" />
              </div>
              <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent-purple)] transition-colors">
                New Business
              </span>
              <span className="text-xs text-[var(--text-muted)] mt-1">
                Set up a new AI-powered business
              </span>
            </button>
          </div>
        )}

        {businesses.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              No businesses yet
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Create your first AI-powered business to get started
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/onboarding" })}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-purple)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Create Business
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function BusinessCard({ business, onSelect }: { business: Business; onSelect: () => void }) {
  const progress = (business as any).onboardingProgress as OnboardingProgress | undefined;
  const isIncomplete =
    progress &&
    progress.completedSteps !== undefined &&
    progress.totalSteps !== undefined &&
    progress.completedSteps < progress.totalSteps;
  const progressPercent = isIncomplete
    ? Math.round(((progress.completedSteps ?? 0) / (progress.totalSteps ?? 1)) * 100)
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group text-left rounded-xl border border-[var(--border-mabos)] bg-[var(--bg-card)] p-6 hover:border-[var(--accent-green)] transition-all hover:shadow-lg cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: isIncomplete
              ? "color-mix(in srgb, var(--accent-yellow, #eab308) 15%, var(--bg-card))"
              : "color-mix(in srgb, var(--accent-purple) 15%, var(--bg-card))",
          }}
        >
          {isIncomplete ? (
            <Rocket className="w-6 h-6 text-[var(--accent-yellow, #eab308)]" />
          ) : (
            <Building2 className="w-6 h-6 text-[var(--accent-purple)]" />
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-green)] transition-colors" />
      </div>

      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{business.name}</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        {business.industry ?? business.type ?? "Business"}
        {business.stage ? ` · ${business.stage}` : ""}
      </p>

      {/* Onboarding progress bar for incomplete businesses */}
      {isIncomplete && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
            <span className="flex items-center gap-1">
              <Rocket className="w-3 h-3" />
              Onboarding: {progress.currentStep ?? "In progress"}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-tertiary, #374151)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: "var(--accent-yellow, #eab308)",
              }}
            />
          </div>
        </div>
      )}

      {/* Stats for completed businesses */}
      {!isIncomplete && (
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {business.agentCount} agents
          </span>
          {business.status && (
            <span className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    business.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                }}
              />
              {business.status}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
