/**
 * IRC Prompt Builder — loads ideation stage templates, renders variables,
 * and parses system/user blocks. Mirrors the GDC prompt builder; the
 * `computeInputHash` helper is reused directly from GDC to keep one source
 * of truth for checkpoint keying.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export { computeInputHash } from "../gdc/prompt-builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "prompts");

/** Stage number to kebab-case filename mapping. */
const STAGE_NAMES: Record<number, string> = {
  1: "stage1-idea-framing",
  2: "stage2-market-research",
  3: "stage3-competitive-landscape",
  4: "stage4-opportunity-synthesis",
  5: "stage5-business-model",
};

export interface PromptBlock {
  system: string;
  user: string;
}

/** Load a template file, substitute variables, and parse system/user blocks. */
function renderTemplate(
  templatePath: string,
  variables: Record<string, unknown> = {},
): PromptBlock {
  let template = readFileSync(templatePath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    template = template.replaceAll(`{{${key}}}`, serialized);
  }

  // Replace any remaining unresolved placeholders with an empty string.
  template = template.replace(/\{\{[a-z_]+\}\}/g, "");

  const sysStart = template.indexOf("<system>");
  const sysEnd = template.indexOf("</system>");
  const usrStart = template.indexOf("<user>");
  const usrEnd = template.indexOf("</user>");

  const system =
    sysStart !== -1 && sysEnd !== -1
      ? template.slice(sysStart + "<system>".length, sysEnd).trim()
      : "";
  const user =
    usrStart !== -1 && usrEnd !== -1
      ? template.slice(usrStart + "<user>".length, usrEnd).trim()
      : "";

  return { system, user };
}

/** Build a prompt for a numbered IRC stage (1-5). */
export function buildIrcPrompt(
  stageNumber: number,
  variables: Record<string, unknown> = {},
): PromptBlock {
  const stageName = STAGE_NAMES[stageNumber];
  if (!stageName) {
    throw new Error(`Unknown IRC stage number: ${stageNumber}. Valid stages: 1-5.`);
  }
  return renderTemplate(join(PROMPTS_DIR, `${stageName}.md`), variables);
}

/** Build the idea-validation prompt for a given persona. */
export function buildValidationPrompt(variables: Record<string, unknown> = {}): PromptBlock {
  return renderTemplate(join(PROMPTS_DIR, "idea-validation.md"), variables);
}
