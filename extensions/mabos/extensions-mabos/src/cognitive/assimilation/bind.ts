/**
 * Bind stage: resolve role values in a Candidate to canonical IRIs (or
 * stringified literals). Calls EntityResolver.resolveOrMint per role.
 *
 * Mint policy is enforced by the resolver implementation, not here. Bind
 * just translates resolver outcomes into BindFailure variants.
 */

import type { Candidate, Bound, BindFailure } from "./types";

export type ResolveResult =
  | { ok: true; iri: string; minted?: boolean }
  | { ok: false; reason: "mint-denied" | "mint-failed"; cause?: string };

export interface EntityResolver {
  resolveOrMint(label: string, concept: string): Promise<ResolveResult>;
}

export interface FactTypeIndex {
  rolePlayer(factTypeId: string, role: string): string;
}

const LITERAL_PLAYERS = /^xsd:/;

export async function bind(
  c: Candidate,
  resolver: EntityResolver,
  idx: FactTypeIndex,
): Promise<Bound | BindFailure> {
  const roles: Record<string, string> = {};
  for (const [role, value] of Object.entries(c.roles)) {
    const concept = idx.rolePlayer(c.factTypeId, role);
    if (LITERAL_PLAYERS.test(concept)) {
      roles[role] = String(value);
      continue;
    }
    const r = await resolver.resolveOrMint(String(value), concept);
    if (!r.ok) {
      if (r.reason === "mint-denied") {
        return { ok: false, reason: "unknown-mint-denied", role, value, concept };
      }
      return {
        ok: false,
        reason: "mint-failed",
        role,
        value,
        concept,
        cause: r.cause ?? "unknown",
      };
    }
    roles[role] = r.iri;
  }
  return {
    ok: true,
    factTypeId: c.factTypeId,
    roles,
    confidence: c.confidence,
    source: c.source,
  };
}
