/**
 * Source Authority — Tiered source classification and contradiction detection.
 *
 * Prevents low-authority sources (LLM heartbeats, autonomous processes) from
 * overwriting facts established by high-authority sources (API syncs, human input).
 *
 * Authority tiers:
 *   T1 — API-verified: direct integration data (Shopify, Stripe, GA, SendGrid)
 *   T2 — Human-verified: stakeholder input, manual entry, CEO directives
 *   T3 — Agent-inferred: BDI cycle observations, agent analysis, inference
 *   T4 — Autonomous: heartbeat tracking, autonomous operations, performance extrapolations
 */

export enum AuthorityTier {
  T1_API_VERIFIED = 1,
  T2_HUMAN_VERIFIED = 2,
  T3_AGENT_INFERRED = 3,
  T4_AUTONOMOUS = 4,
}

export type Fact = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  valid_from?: string;
  valid_until?: string;
  derived_from?: string[];
  rule_id?: string;
  created_at: string;
  updated_at: string;
};

export type ContradictionResult = {
  action: "BLOCK" | "WARN";
  existingFact: Fact;
  existingTier: AuthorityTier;
  incomingTier: AuthorityTier;
  message: string;
};

/** Patterns that classify a source string into an authority tier. */
const T1_PATTERNS = [
  "shopify-sync",
  "shopify-api",
  "shopify api",
  "stripe-",
  "stripe api",
  "google-analytics",
  "ga4-",
  "sendgrid-api",
  "sendgrid-sync",
  "apollo-api",
  "meta-api",
  "pinterest-api",
  "tiktok-api",
];

const T2_PATTERNS = [
  "stakeholder",
  "manual-entry",
  "human-verified",
  "ceo-directive",
  "cfo-report",
  "user-input",
];

const T4_PATTERNS = [
  "heartbeat",
  "autonomous-operation",
  "bdi_heartbeat",
  "enhanced_bdi",
  "performance-tracking",
  "q1-performance",
  "q2-performance",
  "q3-performance",
  "q4-performance",
];

export function resolveAuthorityTier(source: string): AuthorityTier {
  const s = source.toLowerCase();
  if (T1_PATTERNS.some((p) => s.includes(p))) return AuthorityTier.T1_API_VERIFIED;
  if (T2_PATTERNS.some((p) => s.includes(p))) return AuthorityTier.T2_HUMAN_VERIFIED;
  if (T4_PATTERNS.some((p) => s.includes(p))) return AuthorityTier.T4_AUTONOMOUS;
  return AuthorityTier.T3_AGENT_INFERRED;
}

/** Strip currency symbols, commas, and trailing decimals for numeric comparison. */
function normalizeNumericValue(value: string): string {
  const stripped = value.replace(/[$,]/g, "").trim();
  const num = parseFloat(stripped);
  if (!isNaN(num)) return String(num);
  return value.trim().toLowerCase();
}

/**
 * Check whether a new fact contradicts an existing fact.
 *
 * Returns null if no contradiction (safe to write).
 * Returns { action: "BLOCK" } if the incoming source is lower authority.
 * Returns { action: "WARN" } if sources have equal authority but values differ.
 */
export function detectContradiction(
  existingFacts: Fact[],
  subject: string,
  predicate: string,
  newObject: string,
  newSource: string,
): ContradictionResult | null {
  // Find existing facts with matching subject + predicate
  const matches = existingFacts.filter((f) => f.subject === subject && f.predicate === predicate);

  if (matches.length === 0) return null;

  // Use the most recently updated fact as the authoritative one
  const authoritative = matches.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];

  // Check if values are the same (after normalization)
  const normalizedExisting = normalizeNumericValue(authoritative.object);
  const normalizedNew = normalizeNumericValue(newObject);
  if (normalizedExisting === normalizedNew) return null;

  const existingTier = resolveAuthorityTier(authoritative.source);
  const incomingTier = resolveAuthorityTier(newSource);

  // Higher tier number = lower authority
  if (incomingTier > existingTier) {
    return {
      action: "BLOCK",
      existingFact: authoritative,
      existingTier,
      incomingTier,
      message:
        `BLOCKED: Contradiction detected for (${subject}, ${predicate}). ` +
        `Existing value "${authoritative.object}" from T${existingTier} source "${authoritative.source}" ` +
        `conflicts with incoming "${newObject}" from T${incomingTier} source "${newSource}". ` +
        `Lower-authority source cannot overwrite higher-authority fact.`,
    };
  }

  if (incomingTier === existingTier) {
    return {
      action: "WARN",
      existingFact: authoritative,
      existingTier,
      incomingTier,
      message:
        `WARNING: Same-tier contradiction for (${subject}, ${predicate}). ` +
        `Existing: "${authoritative.object}" (${authoritative.source}), ` +
        `Incoming: "${newObject}" (${newSource}). ` +
        `Both are T${existingTier}. Newer value accepted but flagged for review.`,
    };
  }

  // Incoming is higher authority — no conflict, allow it
  return null;
}
