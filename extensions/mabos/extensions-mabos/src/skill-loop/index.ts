/**
 * Skill loop module — autonomous skill creation from agent experience,
 * local skill registry, marketplace integration, and prompt injection.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { textResult, resolveWorkspaceDir } from "../tools/common.js";
import { SkillCreator } from "./creator.js";
import { registerSkillLoopHooks } from "./hooks.js";
import { SkillInjector } from "./injector.js";
import { SkillMarketplace } from "./marketplace.js";
import { SkillNudge } from "./nudge.js";
import { SkillRegistry } from "./registry.js";
import { registerSkillLoopRoutes } from "./routes.js";
import type { SkillLoopConfig } from "./types.js";

export function registerSkillLoop(
  api: OpenClawPluginApi,
  config: { skillLoop?: SkillLoopConfig },
): void {
  const log = api.logger;
  const slConfig = config.skillLoop ?? {};
  const workspaceDir = resolveWorkspaceDir(api);
  const defaultSkillPath = join(workspaceDir, "skills");

  const registry = new SkillRegistry(slConfig.skillPaths ?? [defaultSkillPath]);
  const creator = new SkillCreator(registry);
  const nudge = new SkillNudge(creator, slConfig.creationNudgeInterval ?? 10);
  const marketplace = new SkillMarketplace(slConfig.marketplace);
  const injector = new SkillInjector(registry, slConfig);

  // Scan existing skills on startup
  registry.scan().catch((err) => log.warn(`[skill-loop] Initial scan failed: ${err}`));

  // Tool: skill_list
  api.registerTool({
    name: "skill_list",
    label: "List Skills",
    description: "List all installed skills with their descriptions and tags.",
    parameters: Type.Object({}),
    async execute() {
      await registry.scan();
      const skills = registry.list();
      if (skills.length === 0) return textResult("No skills installed.");
      const lines = skills.map(
        (s) =>
          `${s.name} (v${s.manifest.version}) — ${s.manifest.description.slice(0, 100)} [${s.manifest.tags.join(", ")}]`,
      );
      return textResult(`Installed skills (${skills.length}):\n${lines.join("\n")}`);
    },
  } as AnyAgentTool);

  // Tool: skill_search
  api.registerTool({
    name: "skill_search",
    label: "Search Skills",
    description:
      "Search for skills by keyword, tag, or description in local registry and marketplace.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      include_marketplace: Type.Optional(
        Type.Boolean({ description: "Also search marketplace (default: true)" }),
      ),
    }),
    async execute(_id: string, params: { query: string; include_marketplace?: boolean }) {
      await registry.scan();
      const localResults = registry.search(params.query);

      const lines: string[] = [];
      if (localResults.length > 0) {
        lines.push(`Local (${localResults.length}):`);
        lines.push(
          ...localResults.map((s) => `  ${s.name} — ${s.manifest.description.slice(0, 100)}`),
        );
      }

      if (params.include_marketplace !== false) {
        try {
          const mpResults = await marketplace.search(params.query);
          if (mpResults.length > 0) {
            lines.push(`\nMarketplace (${mpResults.length}):`);
            lines.push(
              ...mpResults.map((s) => `  ${s.name} (${s.source}) — ${s.description.slice(0, 100)}`),
            );
          }
        } catch {
          // Marketplace unavailable — skip silently
        }
      }

      if (lines.length === 0) return textResult(`No skills found for "${params.query}".`);
      return textResult(`Skills matching "${params.query}":\n${lines.join("\n")}`);
    },
  } as AnyAgentTool);

  // Tool: skill_create
  api.registerTool({
    name: "skill_create",
    label: "Create Skill",
    description: "Create a new skill from a description. Generates SKILL.md and manifest.json.",
    parameters: Type.Object({
      name: Type.String({ description: "Skill name (kebab-case)" }),
      description: Type.String({ description: "What the skill does" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Tags" })),
      content: Type.Optional(Type.String({ description: "SKILL.md content (markdown)" })),
    }),
    async execute(
      _id: string,
      params: { name: string; description: string; tags?: string[]; content?: string },
    ) {
      const skillDir = join(defaultSkillPath, params.name);
      await mkdir(skillDir, { recursive: true });

      const manifest = {
        name: params.name,
        version: "1.0.0",
        description: params.description,
        author: "operator",
        tags: params.tags ?? [],
        createdAt: new Date().toISOString(),
      };

      const content =
        params.content ?? `# ${params.description}\n\n## Steps\n\n1. TODO: Define skill steps\n`;

      await writeFile(join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2));
      await writeFile(join(skillDir, "SKILL.md"), content);

      registry.addSkill({ name: params.name, path: skillDir, manifest, content });

      return textResult(`Skill "${params.name}" created at ${skillDir}`);
    },
  } as AnyAgentTool);

  // Tool: skill_install
  api.registerTool({
    name: "skill_install",
    label: "Install Skill",
    description:
      "Install a skill from the marketplace (GitHub or ClawHub) into the local registry.",
    parameters: Type.Object({
      name: Type.String({ description: "Skill name" }),
      source: Type.String({ description: "Source: 'github' or 'clawhub'" }),
      install_url: Type.String({ description: "URL to install from (repo URL or package URL)" }),
    }),
    async execute(_id: string, params: { name: string; source: string; install_url: string }) {
      try {
        const result = await marketplace.install(
          {
            name: params.name,
            version: "latest",
            description: "",
            author: "",
            tags: [],
            source: params.source,
            installUrl: params.install_url,
          },
          defaultSkillPath,
        );

        // Re-scan to pick up the new skill
        await registry.scan();

        return textResult(
          `Installed skill "${result.manifest.name}" (v${result.manifest.version}) at ${result.path}`,
        );
      } catch (err) {
        return textResult(`Failed to install skill: ${err}`);
      }
    },
  } as AnyAgentTool);

  // Tool: skill_run
  api.registerTool({
    name: "skill_run",
    label: "Run Skill",
    description: "Load and display a named skill's instructions for execution.",
    parameters: Type.Object({
      name: Type.String({ description: "Skill name to run" }),
    }),
    async execute(_id: string, params: { name: string }) {
      const skill = registry.get(params.name);
      if (!skill)
        return textResult(
          `Skill "${params.name}" not found. Use skill_list to see available skills.`,
        );
      return textResult(`[SKILL: ${skill.name}]\n\n${skill.content}`);
    },
  } as AnyAgentTool);

  // Register hooks (nudge + prompt injection)
  registerSkillLoopHooks(api, { nudge, injector, config: slConfig });

  // Register HTTP routes
  registerSkillLoopRoutes(api, registry, marketplace);

  log.info(`[skill-loop] Skill loop initialized (paths: ${registry["paths"].join(", ")})`);
}

export { SkillRegistry } from "./registry.js";
export { SkillCreator } from "./creator.js";
export { SkillNudge } from "./nudge.js";
export { SkillMarketplace } from "./marketplace.js";
export { SkillInjector } from "./injector.js";
