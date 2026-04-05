import { Link } from "@tanstack/react-router";
import { ArrowLeft, Cpu, Rocket } from "lucide-react";
import { WizardSteps } from "@/components/onboarding/WizardSteps";

export function OnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar — back to workspace */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-[var(--border-mabos)]">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Workspace
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <Cpu className="w-4 h-4 text-[var(--accent-green)]" />
          <span className="text-xs font-medium">MABOS</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-4xl mx-auto w-full py-8 px-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-purple) 15%, var(--bg-card))",
            }}
          >
            <Rocket className="w-5 h-5 text-[var(--accent-purple)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Business Onboarding</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Set up your AI-powered business with Neo
            </p>
          </div>
        </div>

        {/* Conversational Wizard */}
        <WizardSteps />
      </div>

      {/* Keyframe animations for chat bubbles */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
