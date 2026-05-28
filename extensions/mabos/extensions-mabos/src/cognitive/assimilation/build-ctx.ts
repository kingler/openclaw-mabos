/**
 * Build the AssimilationCtx for a single deliberative cycle.
 *
 * This is the integration adapter between the cognitive-router and the
 * assimilation pipeline. It wires:
 *   - vocabulary templates (from merged ontology fact types)
 *   - EntityResolver with per-tenant entities.json + mint-policy.json
 *   - FactTypeIndex backed by the merged ontology
 *   - DeonticStore backed by NaryFactStore
 *   - TypeDB stub (writes through to NaryFactStore — TypeDB hyperrelation
 *     write is a follow-up plan; the JSON-file store is source of truth in v1)
 *   - Event bus stub (logger only — real bus is a follow-up plan)
 *   - QuarantineStore at <workspaceDir>/.quarantine/<agentId>.jsonl
 *   - Permissive validate shape (per-fact-type SHACL is a follow-up plan)
 *   - Deontic rules from <agentDir>/deontic-rules.json (empty if missing)
 *
 * Per-tenant isolation is enforced by paths:
 *   - <workspaceDir>/.assimilation/<agentId>/nary.json
 *   - <workspaceDir>/.assimilation/<agentId>/entities.json
 *   - <workspaceDir>/.quarantine/<agentId>.jsonl
 *   - <workspaceDir>/.mabos/mint-policy.json (tenant-wide)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  loadOntologies,
  mergeOntologies,
  type SBVRFactTypeAnnotation,
  type OntologyNode,
} from "../../ontology/index.js";
import type { DeonticRule, DeonticStore } from "../../reasoning/formal/deontic.js";
import {
  makeStakeholderSimulator,
  type Simulator,
  type IntentionContext,
} from "../../simulators/index.js";
import type { EntityResolver, FactTypeIndex, ResolveResult } from "./bind.js";
import type { CommitCtx, TypeDBAdapter, EventBus } from "./commit.js";
import type { AssimilationCtx } from "./index.js";
import { NaryFactStore } from "./nary-store.js";
import { QuarantineStore } from "./quarantine.js";
import type { ShapeNode } from "./shacl-mini.js";
import type { Bound, ValidatedBelief, Provenance } from "./types.js";
import type { ValidateCtx } from "./validate.js";
import { compileFactTemplates, type FactTemplate } from "./vocabulary-index.js";

export interface BuildCtxInput {
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  runId: string;
  signalIds: string[];
  model?: string;
  promptHash?: string;
  /**
   * Optional LLM client used to construct the stakeholder simulator. When
   * omitted, no simulators are wired and the simulator gate is a no-op.
   */
  llm?: { complete(prompt: string): Promise<string> };
  /** Per-tenant stakeholder persona for the simulator. Falls back to a generic persona. */
  simulatorPersona?: string;
  log: {
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
}

interface MintPolicy {
  allow: string[];
}

interface EntityRegistry {
  byLabel: Record<string, string>; // label → IRI
  byConcept: Record<string, string[]>; // concept → list of known IRIs
}

// ── Adapters ────────────────────────────────────────────────────────────

async function readJsonOrEmpty<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function loadMintPolicy(workspaceDir: string): Promise<MintPolicy> {
  return readJsonOrEmpty<MintPolicy>(join(workspaceDir, ".mabos", "mint-policy.json"), {
    allow: [],
  });
}

function slug(label: string): string {
  return label
    .replace(/[^\w\s#-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function mintIri(label: string, concept: string): string {
  return `${concept}/${slug(label)}`;
}

async function loadEntityRegistry(path: string): Promise<EntityRegistry> {
  return readJsonOrEmpty<EntityRegistry>(path, { byLabel: {}, byConcept: {} });
}

async function saveEntityRegistry(path: string, reg: EntityRegistry): Promise<void> {
  await mkdir(join(path, "..").replace(/\/$/, ""), { recursive: true }).catch(() => {});
  await writeFile(path, JSON.stringify(reg, null, 2), "utf-8");
}

async function buildResolver(workspaceDir: string, agentId: string): Promise<EntityResolver> {
  const policy = await loadMintPolicy(workspaceDir);
  const registryPath = join(workspaceDir, ".assimilation", agentId, "entities.json");
  const registry = await loadEntityRegistry(registryPath);

  return {
    resolveOrMint: async (label: string, concept: string): Promise<ResolveResult> => {
      const known = registry.byLabel[label];
      if (known) return { ok: true, iri: known };
      if (!policy.allow.includes(concept)) {
        return { ok: false, reason: "mint-denied" };
      }
      try {
        const iri = mintIri(label, concept);
        registry.byLabel[label] = iri;
        registry.byConcept[concept] = [...(registry.byConcept[concept] ?? []), iri];
        await saveEntityRegistry(registryPath, registry);
        return { ok: true, iri, minted: true };
      } catch (err) {
        return {
          ok: false,
          reason: "mint-failed",
          cause: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

function buildFactTypeIndex(factTypes: Map<string, OntologyNode>): FactTypeIndex {
  return {
    rolePlayer(factTypeId: string, role: string): string {
      const node = factTypes.get(factTypeId);
      if (!node) return "owl:Thing";
      const roles = node["sbvr:roles"] as Array<Record<string, string>> | undefined;
      if (roles) {
        const match = roles.find((r) => r["sbvr:roleName"] === role);
        if (match) return match["sbvr:rolePlayer"] ?? "owl:Thing";
      }
      // Fallback for binary fact types using rdfs:domain/range
      const rdfsDomain = node["rdfs:domain"];
      const rdfsRange = node["rdfs:range"];
      if (role === "subject" && typeof rdfsDomain === "string") return rdfsDomain;
      if (role === "object" && typeof rdfsRange === "string") return rdfsRange;
      return "owl:Thing";
    },
  };
}

function buildDeonticStore(naryStore: NaryFactStore): DeonticStore {
  return {
    countFacts: (factTypeId, where) => naryStore.countNary(factTypeId, where),
    getProperty: async (iri, property) => {
      // Properties are stored as 2-ary facts of type "<property>Fact" with
      // roles { subject: <iri>, value: <value> }. This is a v1 convention;
      // a richer property model lands with the TOGAF/upper-ontology plan.
      const r = await naryStore.queryNary(`${property}Fact`, { subject: iri });
      if (r.length === 0) return undefined;
      const raw = r[0].roles.value;
      const num = Number(raw);
      return Number.isFinite(num) ? num : raw;
    },
  };
}

function buildTypedbAdapter(naryStore: NaryFactStore): TypeDBAdapter {
  // v1: write through to the n-ary JSON store. Real TypeDB hyperrelation
  // write is a follow-up plan; the n-ary store is source of truth for now.
  return {
    assertVersioned: async (v: ValidatedBelief, p: Provenance) => {
      await naryStore.assertNary({
        factTypeId: v.factTypeId,
        roles: v.roles,
        provenance: { run_id: p.run_id, ts: p.ts, model: p.model },
      });
    },
  };
}

function buildEventBus(log: BuildCtxInput["log"]): EventBus {
  // v1: log + minimal in-memory subscriber registry. Real bus (queues,
  // cross-process, persistence) is a follow-up plan.
  const handlers: Array<(e: import("./commit.js").BeliefCommittedEvent) => void | Promise<void>> =
    [];
  return {
    publish: async (event) => {
      log.debug(
        `[assimilate] event ${event.type} fact=${event.fact.factTypeId} run=${event.provenance.run_id}`,
      );
      for (const h of handlers) {
        try {
          await h(event);
        } catch (err) {
          log.warn?.(
            `[assimilate] subscriber threw on ${event.type}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    },
    on: (_eventType, handler) => {
      handlers.push(handler);
    },
  };
}

// ── Public ──────────────────────────────────────────────────────────────

const PERMISSIVE_SHAPE: ShapeNode = { targetClass: "any", properties: [] };

/**
 * Build a vocabulary hint string for injection into the deliberative
 * system prompt. Lists known fact-type readings so the LLM prefers
 * structured forms that the assimilation pipeline can lift cleanly.
 *
 * Returns "" when no fact types are available (graceful no-op).
 */
export function buildVocabularyHint(maxFactTypes = 30): string {
  try {
    const ontologies = loadOntologies();
    const merged = mergeOntologies(ontologies);
    const lines = [...merged.objectProperties.values()]
      .filter((n) => n["sbvr:conceptType"] === "FactType" && typeof n["sbvr:reading"] === "string")
      .slice(0, maxFactTypes)
      .map((n) => {
        const reading = String(n["sbvr:reading"]);
        const vocab = String(n["sbvr:vocabulary"] ?? "");
        return vocab ? `- "${reading}" (${vocab})` : `- "${reading}"`;
      });
    if (lines.length === 0) return "";
    return [
      "",
      "For each BELIEF_UPDATE bullet, prefer matching one of the agent's known fact-type readings verbatim. Free-form bullets are accepted but may be quarantined for review.",
      "",
      "KNOWN FACT TYPES FOR THIS AGENT:",
      ...lines,
    ].join("\n");
  } catch {
    return "";
  }
}

/**
 * Map a bound intention fact to an IntentionContext for the simulator gate.
 *
 * Handles two shapes:
 *  - `mabos:CommitsToFact` — richer intention with impact metadata (produced
 *    by a future structured intention lifter); maps all fields through.
 *  - `mabos:NewIntentionFact` — current Plan 1 shape carrying only `content`;
 *    maps description=content with no impact metadata, so the high-stakes
 *    `appliesTo` predicate stays false until richer extraction lands.
 *
 * Returns null for any non-intention fact, which skips the simulator gate.
 */
function intentionFromBound(agentId: string): (b: Bound) => IntentionContext | null {
  return (b) => {
    if (b.factTypeId === "mabos:CommitsToFact") {
      return {
        agentId,
        intentionId: String(b.roles.intention ?? ""),
        description: String(b.roles.description ?? ""),
        affectedSubjects: String(b.roles.affects ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        estimatedImpactUsd: Number(b.roles.impactUsd) || 0,
        affectsLegal: String(b.roles.legal ?? "").toLowerCase() === "true",
        affectsPublicFacing: String(b.roles.publicFacing ?? "").toLowerCase() === "true",
      };
    }
    if (b.factTypeId === "mabos:NewIntentionFact") {
      return {
        agentId,
        intentionId: String(b.roles.intention ?? "I-?"),
        description: String(b.roles.content ?? ""),
        affectedSubjects: [],
      };
    }
    return null;
  };
}

export async function buildAssimilationCtx(input: BuildCtxInput): Promise<AssimilationCtx> {
  const ontologies = loadOntologies();
  const merged = mergeOntologies(ontologies);

  // Compile templates from object-property fact types
  const factTypeShapes = [...merged.objectProperties.values()]
    .filter((n) => n["sbvr:conceptType"] === "FactType")
    .map((n): SBVRFactTypeAnnotation & { id: string; reading: string } => ({
      id: String(n["@id"]),
      reading: String(n["sbvr:reading"] ?? ""),
      arity: Number(n["sbvr:arity"] ?? 2),
      roles: ((n["sbvr:roles"] as Array<Record<string, string>>) ?? []).map((r) => ({
        roleName: r["sbvr:roleName"] ?? "",
        rolePlayer: r["sbvr:rolePlayer"] ?? "owl:Thing",
      })),
      conceptType: "FactType",
      designation: String(n["sbvr:designation"] ?? ""),
      definition: String(n["sbvr:definition"] ?? ""),
      vocabulary: String(n["sbvr:vocabulary"] ?? ""),
    }))
    .filter((ft) => ft.reading && ft.roles.length > 0);

  const templates: FactTemplate[] = compileFactTemplates(factTypeShapes);

  const naryStorePath = join(input.workspaceDir, ".assimilation", input.agentId, "nary.json");
  const naryStore = new NaryFactStore(naryStorePath);

  const resolver = await buildResolver(input.workspaceDir, input.agentId);
  const factTypeIndex = buildFactTypeIndex(merged.objectProperties);
  const store = buildDeonticStore(naryStore);
  const typedb = buildTypedbAdapter(naryStore);
  const bus = buildEventBus(input.log);

  const rules = await readJsonOrEmpty<DeonticRule[]>(
    join(input.agentDir, "deontic-rules.json"),
    [],
  );

  const quarantineStore = new QuarantineStore(
    join(input.workspaceDir, ".quarantine", `${input.agentId}.jsonl`),
  );

  // Simulator gate — only wired when an LLM client is supplied. The persona is
  // per-tenant; falls back to a generic stakeholder. Until a structured
  // intention lifter emits mabos:CommitsToFact with impact metadata, the
  // high-stakes appliesTo predicate stays dormant for the current
  // mabos:NewIntentionFact shape (see intentionFromBound).
  const simulators: Simulator[] = input.llm
    ? [
        makeStakeholderSimulator({
          llm: input.llm,
          persona: input.simulatorPersona ?? "the primary affected stakeholder",
        }),
      ]
    : [];

  return {
    agentId: input.agentId,
    agentDir: input.agentDir,
    templates,
    resolver,
    factTypeIndex,
    quarantineStore,
    shape: PERMISSIVE_SHAPE,
    rules,
    store,
    typedb,
    bus,
    simulators,
    intentionFromBound: intentionFromBound(input.agentId),
    provenance: {
      run_id: input.runId,
      model: input.model ?? "unknown",
      prompt_hash: input.promptHash ?? "",
      signal_ids: input.signalIds,
      ts: new Date().toISOString(),
    },
  };
}
