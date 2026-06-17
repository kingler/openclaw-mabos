export interface ModelSpec {
  id: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePer1kTokens: number;
  outputPricePer1kTokens: number;
  supportsPromptCaching?: boolean;
  supportsExtendedThinking?: boolean;
  supportsVision?: boolean;
}

export interface ResolvedModel {
  modelId: string;
  provider: string;
  spec: ModelSpec;
  apiKeyEnv?: string;
}

/** Level of effort tier — maps to a candidate model pool in the effort policy. */
export type EffortLevel = "low" | "medium" | "high";

/**
 * Per-provider default API key env var. The selector treats a provider as
 * having capacity only when its key is present in the environment.
 */
export const DEFAULT_PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

/** Default candidate pools per effort level (overridable via config.effortPolicy). */
export const DEFAULT_EFFORT_POLICY: Record<EffortLevel, string[]> = {
  low: ["claude-haiku-4-5", "gpt-4.1-mini", "gemini-2.5-flash", "deepseek-v3"],
  medium: ["claude-sonnet-4-6", "gpt-4.1", "gemini-2.5-pro", "deepseek-v3"],
  high: ["claude-opus-4-6", "o3", "gemini-2.5-pro", "deepseek-r1"],
};

export interface ModelRouterConfig {
  modelRouterEnabled?: boolean;
  defaultProvider?: string;
  fallbackChain?: string[];
  providers?: Record<string, { baseUrl?: string; apiKeyEnv: string }>;
  promptCaching?: { enabled?: boolean };
  /** Candidate model pools per effort level. Falls back to DEFAULT_EFFORT_POLICY. */
  effortPolicy?: Partial<Record<EffortLevel, string[]>>;
  /** Cost guardrails for effort-based selection. */
  costBudget?: {
    /** Skip any model whose blended (input+output) price per 1k exceeds this. */
    maxUsdPer1kBlended?: number;
  };
  /** Milliseconds a provider is skipped after a capacity failure (429/5xx). Default 60000. */
  capacityCooldownMs?: number;
  moa?: {
    enabled?: boolean;
    referenceModels?: string[];
    aggregatorModel?: string;
    maxParallelCalls?: number;
  };
}
