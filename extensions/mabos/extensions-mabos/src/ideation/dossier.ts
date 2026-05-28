/**
 * IRC dossier writer — renders the human-readable research dossier and
 * seeds agent cognitive files so the founder's research bootstraps the
 * Strategy and Sales-Research agents instead of them starting blind.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompetitiveLandscape, IrcResult, MarketResearch, ResearchFinding } from "./types.js";

function renderFindings(title: string, findings: ResearchFinding[] | undefined): string {
  if (!findings || findings.length === 0) return "";
  const lines = findings.map((f) => {
    const tag = f.unverified ? " _(unverified)_" : "";
    const cites =
      f.sources.length > 0 ? ` — ${f.sources.map((s) => `[${s.title}](${s.url})`).join(", ")}` : "";
    return `- **${f.claim}**${tag}: ${f.evidence}${cites}`;
  });
  return `### ${title}\n\n${lines.join("\n")}\n\n`;
}

/** Render the full ideation dossier as Markdown. */
export function renderDossier(result: IrcResult): string {
  const parts: string[] = ["# Ideation and Research Dossier\n"];

  if (result.ideaFrame) {
    const f = result.ideaFrame;
    parts.push(
      `## Idea Frame\n\n` +
        `**Problem:** ${f.problem_statement}\n\n` +
        `**Target user:** ${f.target_user_hypothesis}\n\n` +
        `**Jobs to be done:**\n${f.jobs_to_be_done.map((j) => `- ${j}`).join("\n")}\n\n` +
        `**Riskiest assumptions:**\n${f.riskiest_assumptions.map((a) => `- ${a}`).join("\n")}\n\n`,
    );
  }

  if (result.marketResearch) {
    const m = result.marketResearch;
    parts.push(`## Market Research _(mode: ${m.mode})_\n\n`);
    parts.push(
      `**Sizing** — TAM: ${m.sizing.tam} · SAM: ${m.sizing.sam} · SOM: ${m.sizing.som}\n\n` +
        `Assumptions:\n${m.sizing.assumptions.map((a) => `- ${a}`).join("\n")}\n\n`,
    );
    parts.push(renderFindings("Findings", m.findings));
    parts.push(renderFindings("Trends", m.trends));
    parts.push(renderFindings("Regulatory", m.regulatory));
  }

  if (result.competitiveLandscape) {
    const c = result.competitiveLandscape;
    parts.push(`## Competitive Landscape\n\n`);
    for (const comp of c.competitors) {
      parts.push(
        `### ${comp.name}\n\n` +
          `- Positioning: ${comp.positioning}\n` +
          `- Pricing: ${comp.pricing_posture}\n` +
          `- Strengths: ${comp.strengths.join(", ")}\n` +
          `- Weaknesses: ${comp.weaknesses.join(", ")}\n\n`,
      );
    }
    parts.push(`**Positioning gaps:**\n${c.positioning_gaps.map((g) => `- ${g}`).join("\n")}\n\n`);
    parts.push(`**Moat hypotheses:**\n${c.moat_hypotheses.map((g) => `- ${g}`).join("\n")}\n\n`);
  }

  if (result.opportunityThesis) {
    const t = result.opportunityThesis;
    parts.push(
      `## Opportunity Thesis\n\n` +
        `**Value proposition:** ${t.value_proposition}\n\n` +
        `**Differentiation:** ${t.differentiation}\n\n` +
        `**Recommendation:** ${t.recommendation.toUpperCase()} ` +
        `(confidence ${(t.confidence * 100).toFixed(0)}%, ` +
        `desirability ${t.scores.desirability}/10, viability ${t.scores.viability}/10, feasibility ${t.scores.feasibility}/10)\n\n`,
    );
    if (t.simulator_objections.length > 0) {
      parts.push(
        `**Objections from validation gate:**\n` +
          t.simulator_objections
            .map((o) => `- _(${o.persona}, ${o.severity})_ ${o.objection}`)
            .join("\n") +
          "\n\n",
      );
    }
  }

  return parts.join("");
}

/** Build a seed Observations/Beliefs summary string from research. */
function renderSeedObservations(
  market: MarketResearch | undefined,
  landscape: CompetitiveLandscape | undefined,
): string {
  const lines: string[] = ["# Seed Observations (from onboarding research)\n"];
  if (market) {
    lines.push("## Market");
    for (const f of market.findings.slice(0, 10)) {
      lines.push(`- ${f.claim}${f.unverified ? " (unverified)" : ""}`);
    }
  }
  if (landscape) {
    lines.push("\n## Competitors");
    for (const c of landscape.competitors) lines.push(`- ${c.name}: ${c.positioning}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Write the dossier file and seed cognitive observations for the agents
 * that consume research (strategy, sales-research).
 */
export async function writeDossier(params: {
  ideationDir: string;
  result: IrcResult;
  seedAgentDirs?: string[];
}): Promise<{ filesWritten: string[] }> {
  const { ideationDir, result, seedAgentDirs = [] } = params;
  const filesWritten: string[] = [];

  await mkdir(ideationDir, { recursive: true });
  const dossierPath = join(ideationDir, "ideation-dossier.md");
  await writeFile(dossierPath, renderDossier(result));
  filesWritten.push(dossierPath);

  const seed = renderSeedObservations(result.marketResearch, result.competitiveLandscape);
  for (const dir of seedAgentDirs) {
    await mkdir(dir, { recursive: true });
    const obsPath = join(dir, "Observations.md");
    await writeFile(obsPath, seed);
    filesWritten.push(obsPath);
  }

  return { filesWritten };
}
