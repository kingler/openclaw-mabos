import { Rocket } from "lucide-react";
import { WizardSteps } from "@/components/onboarding/WizardSteps";

export function OnboardingPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
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
