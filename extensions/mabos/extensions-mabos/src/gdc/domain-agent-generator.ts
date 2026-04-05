/**
 * GDC Domain Agent Generator — takes pipeline output + CompanyDNA and
 * generates domain-specific agent specs via LLM, replacing hardcoded
 * industry-to-agent mappings.
 */

import { buildDomainAgentPrompt } from "./prompt-builder.js";
import type {
  CompanyDNA,
  DomainAgentSpec,
  LlmCallFn,
  Stage1Output,
  Stage3Output,
} from "./types.js";

const CORE_AGENT_IDS = new Set([
  "ceo",
  "cfo",
  "coo",
  "cmo",
  "cto",
  "hr",
  "legal",
  "strategy",
  "knowledge",
]);

/**
 * Generate domain-specific agent specs by invoking an LLM with company
 * context, goals, and tool inventory.
 */
export async function generateDomainAgents(params: {
  companyDNA: CompanyDNA;
  stage1Goals: Stage1Output;
  stage3Projects?: Stage3Output;
  toolInventory: string[];
  callLlm: LlmCallFn;
  config?: { model?: string; maxAgents?: number };
}): Promise<DomainAgentSpec[]> {
  const { companyDNA, stage1Goals, toolInventory, callLlm, config } = params;

  // Build BMC summary for prompt
  const bmcSummary = companyDNA.bmc
    ? Object.entries(companyDNA.bmc)
        .filter(([, items]) => items.length > 0)
        .map(
          ([key, items]) =>
            `**${key}:** ${items.map((i) => `${i.title} (${i.description})`).join("; ")}`,
        )
        .join("\n")
    : "Not provided";

  // Build goals summary from stage 1 output
  const goalsSummary = stage1Goals.goals
    .map((g) => `[${g.category}] ${g.id}: ${g.statement} (priority=${g.priority}, ${g.type})`)
    .join("\n");

  // Build prompt via template renderer
  const { system, user } = buildDomainAgentPrompt({
    company_description: companyDNA.business_description,
    mission: companyDNA.mission,
    vision: companyDNA.vision,
    industry: companyDNA.industry ?? "Not specified",
    stage: companyDNA.stage ?? "Not specified",
    bmc_summary: bmcSummary,
    goals_summary: goalsSummary,
    tool_inventory: toolInventory.join(", "),
  });

  // Call LLM
  const model = config?.model ?? "claude-sonnet-4-6";
  const response = await callLlm({
    model,
    system,
    user,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // Parse and validate
  const parsed = parseAgentResponse(response);
  const maxAgents = config?.maxAgents ?? 8;
  return validateAgents(parsed, maxAgents);
}

/**
 * Parse the LLM response text into an array of DomainAgentSpec objects.
 * Handles direct JSON arrays, `{ domain_agents: [...] }` wrappers,
 * and code-fenced responses.
 */
function parseAgentResponse(text: string): DomainAgentSpec[] {
  let json: unknown;

  // Try direct parse first
  try {
    json = JSON.parse(text);
  } catch {
    // Try extracting from code block
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      json = JSON.parse(match[1]);
    } else {
      // Last resort: find first JSON object/array
      const objMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (objMatch) {
        json = JSON.parse(objMatch[1]);
      } else {
        throw new Error("No valid JSON in domain agent response");
      }
    }
  }

  // Handle { domain_agents: [...] } wrapper
  if (json && typeof json === "object" && !Array.isArray(json) && "domain_agents" in json) {
    return (json as { domain_agents: DomainAgentSpec[] }).domain_agents;
  }

  if (Array.isArray(json)) return json as DomainAgentSpec[];

  throw new Error("Unexpected response format for domain agents");
}

/**
 * Validate and normalize agent specs:
 * - Enforces required fields (id, role, description)
 * - Normalizes IDs to kebab-case
 * - Filters out core agent ID conflicts
 * - Deduplicates by ID
 * - Ensures array fields default to empty arrays
 * - Caps at maxAgents
 */
function validateAgents(agents: DomainAgentSpec[], maxAgents: number): DomainAgentSpec[] {
  const valid: DomainAgentSpec[] = [];
  const seenIds = new Set<string>();

  for (const agent of agents.slice(0, maxAgents + CORE_AGENT_IDS.size)) {
    // Skip if missing required fields
    if (!agent.id || !agent.role || !agent.description) continue;

    // Normalize ID to kebab-case
    agent.id = agent.id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Skip if conflicts with core agents
    if (CORE_AGENT_IDS.has(agent.id)) continue;

    // Skip duplicates
    if (seenIds.has(agent.id)) continue;
    seenIds.add(agent.id);

    // Ensure arrays exist
    agent.capabilities = agent.capabilities ?? [];
    agent.reasoning_methods = agent.reasoning_methods ?? [];
    agent.terminal_desires = agent.terminal_desires ?? [];
    agent.source = agent.source ?? "industry";

    valid.push(agent);

    // Stop once we have enough
    if (valid.length >= maxAgents) break;
  }

  return valid;
}

// Exported for testing
export { parseAgentResponse, validateAgents };
