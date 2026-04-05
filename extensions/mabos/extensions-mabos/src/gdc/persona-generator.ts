/**
 * LLM-powered persona generator for domain-specific agents.
 *
 * Core agents (CEO, CFO, etc.) use template files; domain agents produced
 * by the GDC pipeline need dynamically generated Persona.md content that
 * reflects the specific business context.
 */

import type { CompanyDNA, DomainAgentSpec, LlmCallFn } from "./types.js";

/**
 * Generate a rich Persona.md for a domain-specific agent.
 * Returns the markdown content ready to write to the agent's directory.
 */
export async function generatePersona(params: {
  agentSpec: DomainAgentSpec;
  companyDNA: CompanyDNA;
  businessName: string;
  coreAgentRoles: string[]; // List of core agent roles for collaboration references
  callLlm: LlmCallFn;
}): Promise<string> {
  const { agentSpec, companyDNA, businessName, coreAgentRoles, callLlm } = params;

  const system = `You are an expert organizational designer specializing in AI agent team composition.
Generate a detailed persona document for an AI agent in a Multi-Agent Business Operating System (MABOS).
The persona should define the agent's identity, responsibilities, decision authority, collaboration patterns, and success metrics.
Output in clean markdown format. Be specific to this business context — not generic.`;

  const user = `Generate a Persona.md for this domain-specific agent:

**Agent ID:** ${agentSpec.id}
**Role:** ${agentSpec.role}
**Description:** ${agentSpec.description}
**Capabilities:** ${agentSpec.capabilities.join(", ")}
**Reasoning Methods:** ${agentSpec.reasoning_methods.join(", ")}
**Terminal Desires:** ${agentSpec.terminal_desires.join(", ")}
**Generation Source:** ${agentSpec.source}

**Business Context:**
- Company: ${businessName}
- Industry: ${companyDNA.industry}
- Stage: ${companyDNA.stage}
- Mission: ${companyDNA.mission}
- Vision: ${companyDNA.vision}

**Core Team (agents this agent collaborates with):**
${coreAgentRoles.map((r) => `- ${r}`).join("\n")}

Generate the persona with these sections:
1. **Identity** — Name, title, one-line mission
2. **Core Responsibilities** — 4-6 bullet points of what this agent owns
3. **Decision Authority** — What decisions it can make autonomously vs. must escalate
4. **Collaboration Patterns** — Which core agents it works with most and how
5. **Success Metrics** — 3-5 KPIs this agent is measured by
6. **Communication Style** — How it communicates (formal/informal, data-driven/narrative, proactive/reactive)
7. **Operating Principles** — 3-4 guiding principles for decision-making
8. **Escalation Triggers** — Conditions that require human or CEO intervention

Format as clean markdown with ## headers. Do not include any preamble — start directly with the persona content.`;

  const response = await callLlm({
    model: "claude-sonnet-4-6",
    system,
    user,
    maxTokens: 2048,
    temperature: 0.4,
  });

  // Add header and metadata
  const header = `# Persona: ${agentSpec.role}\n*Agent: ${agentSpec.id} @ ${businessName}*\n*Generated: ${new Date().toISOString()}*\n*Source: ${agentSpec.source} analysis*\n\n`;

  return header + response.trim();
}

/**
 * Generate personas for all domain agents in batch.
 * Returns a map of agentId -> persona markdown content.
 */
export async function generatePersonaBatch(params: {
  agentSpecs: DomainAgentSpec[];
  companyDNA: CompanyDNA;
  businessName: string;
  coreAgentRoles?: string[];
  callLlm: LlmCallFn;
}): Promise<Map<string, string>> {
  const coreRoles = params.coreAgentRoles ?? [
    "CEO",
    "CFO",
    "COO",
    "CMO",
    "CTO",
    "HR",
    "Legal",
    "Strategy",
    "Knowledge",
  ];
  const results = new Map<string, string>();

  for (const spec of params.agentSpecs) {
    try {
      const persona = await generatePersona({
        agentSpec: spec,
        companyDNA: params.companyDNA,
        businessName: params.businessName,
        coreAgentRoles: coreRoles,
        callLlm: params.callLlm,
      });
      results.set(spec.id, persona);
    } catch {
      // Graceful degradation: generate a minimal fallback persona
      results.set(spec.id, buildFallbackPersona(spec, params.businessName));
    }
  }

  return results;
}

/** Produce a minimal persona when LLM generation fails. */
function buildFallbackPersona(spec: DomainAgentSpec, businessName: string): string {
  return `# Persona: ${spec.role}
*Agent: ${spec.id} @ ${businessName}*
*Generated: ${new Date().toISOString()}*

## Identity
**${spec.role}** — ${spec.description}

## Core Responsibilities
${spec.capabilities.map((c) => `- ${c}`).join("\n")}

## Terminal Desires
${spec.terminal_desires.map((d) => `- ${d}`).join("\n")}

## Reasoning Methods
${spec.reasoning_methods.map((m) => `- ${m}`).join("\n")}
`;
}
