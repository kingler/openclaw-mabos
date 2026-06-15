/**
 * GDC bootstrap step — runs the Goal Decomposition Chain for a freshly
 * scaffolded instance and materializes BDI cognitive state for every agent.
 * Reuses the exported GDC building blocks (orchestrator, domain-agent
 * generator, cognitive writer) rather than re-implementing the pipeline.
 */

import { join } from "node:path";
import { writeCognitiveState } from "../gdc/cognitive-writer.js";
import { generateDomainAgents } from "../gdc/domain-agent-generator.js";
import { GdcOrchestrator } from "../gdc/orchestrator.js";
import type {
  CompanyDNA,
  GdcPipelineConfig,
  GdcResult,
  LlmCallFn,
  ToolInventoryItem,
} from "../gdc/types.js";
import { CORE_ROLES } from "./scaffold.js";

function defaultPipelineConfig(maxStage?: number): GdcPipelineConfig {
  return {
    enabled: true,
    maxStage: (maxStage ?? 7) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    pattern: "sequential",
    maxParallelBranches: 1,
    models: {},
    checkpointDir: "",
    enableCaching: false,
  };
}

export interface GdcBootstrapResult {
  result: GdcResult;
  agents: string[];
  filesWritten: number;
}

/**
 * Run GDC for `businessId` and write cognitive files for the core roles plus
 * any generated domain agents. Returns the full result and the agent roster.
 */
export async function runGdcBootstrap(params: {
  workspaceDir: string;
  businessId: string;
  companyDNA: CompanyDNA;
  toolInventory: ToolInventoryItem[];
  callLlm: LlmCallFn;
  maxStage?: number;
}): Promise<GdcBootstrapResult> {
  const { workspaceDir, businessId, companyDNA, toolInventory, callLlm, maxStage } = params;

  const orchestrator = new GdcOrchestrator(defaultPipelineConfig(maxStage), callLlm);
  const result = await orchestrator.run(companyDNA, toolInventory);

  if (result.stage1) {
    result.domain_agents = await generateDomainAgents({
      companyDNA,
      stage1Goals: result.stage1,
      stage3Projects: result.stage3,
      toolInventory: toolInventory.map((t) => t.name),
      callLlm,
    });
  }

  const roles = [...CORE_ROLES, ...result.domain_agents.map((a) => a.id)];

  const businessName = companyDNA.business_description.split(".")[0] ?? businessId;
  let filesWritten = 0;

  for (const role of roles) {
    const agentDir = join(workspaceDir, "businesses", businessId, "agents", role);
    const { filesWritten: written } = await writeCognitiveState({
      agentDir,
      agentRole: role,
      gdcResult: result,
      companyDNA,
      businessName,
    });
    filesWritten += written.length;
  }

  return { result, agents: roles, filesWritten };
}
