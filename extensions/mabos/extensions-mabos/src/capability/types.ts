/**
 * Capability gap types.
 *
 * Per Plan 2's amendment: the gap is a *derived view*, not a stored fact.
 * `CapabilityGap` is a query-result shape; nothing of this type is persisted
 * in the n-ary store.
 */

export interface CapabilityRef {
  id: string;
  label: string;
}

export interface CapabilityGap {
  agentId: string;
  goalId: string;
  missing: CapabilityRef[];
  ts: string;
}

export interface CapabilityCatalog {
  /** S' — capabilities required to satisfy the given goal */
  requiredFor(goalId: string): Promise<CapabilityRef[]>;
  /** S₀ — capabilities the given agent currently holds */
  heldBy(agentId: string): Promise<CapabilityRef[]>;
}
