/**
 * Instance scaffolding — lays down the `businesses/<id>/` skeleton that the GDC
 * pipeline then fills with cognitive state. This is intentionally lighter than
 * the agent-facing `onboard_business` tool: it writes the manifest, the input
 * artifacts the GDC loaders read (`company_dna.json`, `tool_inventory.json`),
 * persisted integration credentials, and empty per-agent state. The GDC
 * bootstrap step (see cognitive.ts) writes Beliefs/Desires/Goals/Plans/etc.
 */

import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProvisionRequest } from "./types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
// From src/provisioning/ (source) or dist/src/provisioning/ (compiled).
const EXT_ROOT = __dir.includes("dist") ? join(__dir, "..", "..", "..") : join(__dir, "..", "..");

/** Canonical C-suite + functional roles every instance starts with. */
export const CORE_ROLES = [
  "ceo",
  "cfo",
  "coo",
  "cmo",
  "cto",
  "hr",
  "legal",
  "strategy",
  "knowledge",
] as const;

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

export interface ScaffoldResult {
  businessDir: string;
  agents: string[];
}

/**
 * Create the on-disk skeleton for an instance. Throws if the business already
 * exists so the caller can return 409 (idempotency on `business_id`).
 */
export async function scaffoldInstance(
  workspaceDir: string,
  req: ProvisionRequest,
): Promise<ScaffoldResult> {
  const businessDir = join(workspaceDir, "businesses", req.business_id);
  if (existsSync(businessDir)) {
    throw new Error(`Business '${req.business_id}' already exists`);
  }

  const now = new Date().toISOString();
  const template = req.template ?? "base";

  // 1. Manifest
  await writeJson(join(businessDir, "manifest.json"), {
    id: req.business_id,
    name: req.name,
    legal_name: req.legal_name ?? req.name,
    type: req.company_dna.industry,
    template,
    description: req.company_dna.business_description,
    stage: req.company_dna.stage,
    status: "provisioning",
    created: now,
    agents: [...CORE_ROLES],
    domain_agents: [],
  });

  // 2. GDC input artifacts (read back by the GDC loaders in cognitive.ts)
  await writeJson(join(businessDir, "company_dna.json"), req.company_dna);
  await writeJson(join(businessDir, "tool_inventory.json"), req.tool_inventory ?? []);

  // 3. Integration credentials (per-service)
  if (req.integrations && Object.keys(req.integrations).length > 0) {
    await writeJson(join(businessDir, "integrations.json"), req.integrations);
  }

  // 4. Per-agent skeleton. Copy template persona/capabilities when the chosen
  //    template provides them; always seed empty cognitive state files.
  const templateAgents = join(
    EXT_ROOT,
    "templates",
    template === "base" ? "base" : template,
    "agents",
  );
  const baseAgents = join(EXT_ROOT, "templates", "base", "agents");

  for (const role of CORE_ROLES) {
    const agentDir = join(businessDir, "agents", role);
    await mkdir(agentDir, { recursive: true });

    const fromTemplate = existsSync(join(templateAgents, role))
      ? join(templateAgents, role)
      : existsSync(join(baseAgents, role))
        ? join(baseAgents, role)
        : null;

    for (const file of ["Persona.md", "Capabilities.md", "agent.json"]) {
      if (fromTemplate && existsSync(join(fromTemplate, file))) {
        await cp(join(fromTemplate, file), join(agentDir, file));
      }
    }

    await writeJson(join(agentDir, "inbox.json"), []);
    await writeJson(join(agentDir, "cases.json"), []);
    await writeJson(join(agentDir, "facts.json"), { facts: [], version: 0 });
    await writeJson(join(agentDir, "rules.json"), { rules: [], version: 0 });
    await writeJson(join(agentDir, "memory-store.json"), {
      working: [],
      short_term: [],
      long_term: [],
      version: 0,
    });
  }

  // 5. Shared business resources
  await writeJson(join(businessDir, "decision-queue.json"), []);
  await writeJson(join(businessDir, "metrics.json"), { metrics: [], snapshots: [] });
  await writeText(
    join(businessDir, "README.md"),
    `# ${req.name}\n\n**Type:** ${req.company_dna.industry}\n**Template:** ${template}\n**Created:** ${now}\n\n${req.company_dna.business_description}\n`,
  );

  return { businessDir, agents: [...CORE_ROLES] };
}
