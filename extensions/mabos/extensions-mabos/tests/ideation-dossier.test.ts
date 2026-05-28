import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDossier, writeDossier } from "../src/ideation/dossier.js";
import type { IrcResult } from "../src/ideation/types.js";

const result: IrcResult = {
  ideaFrame: {
    raw_idea: "x",
    problem_statement: "owners can't find walkers",
    jobs_to_be_done: ["book a walk"],
    target_user_hypothesis: "urban owners",
    assumed_value: "trust",
    riskiest_assumptions: ["pay premium"],
    industry_hint: "pet",
  },
  marketResearch: {
    questions: ["q"],
    findings: [
      {
        claim: "market is growing",
        evidence: "report says 12% CAGR",
        sources: [
          {
            url: "https://src.example/report",
            title: "Pet Report",
            retrieved_at: "2026-05-28T00:00:00Z",
          },
        ],
        unverified: false,
      },
    ],
    sizing: { tam: "$1B", sam: "$100M", som: "$5M", assumptions: ["urban"] },
    trends: [],
    regulatory: [],
    mode: "researched",
  },
  competitiveLandscape: {
    competitors: [
      {
        name: "Rover",
        positioning: "marketplace",
        pricing_posture: "commission",
        strengths: [],
        weaknesses: [],
        sources: [],
      },
    ],
    positioning_gaps: ["premium tier"],
    moat_hypotheses: ["network"],
  },
  errors: [],
};

describe("IRC dossier", () => {
  it("renders findings with sources and competitors", () => {
    const md = renderDossier(result);
    expect(md).toContain("market is growing");
    expect(md).toContain("https://src.example/report");
    expect(md).toContain("Rover");
  });

  it("writes the dossier and seed observations to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "irc-dossier-"));
    const agentDir = join(dir, "agents", "strategy");
    const { filesWritten } = await writeDossier({
      ideationDir: dir,
      result,
      seedAgentDirs: [agentDir],
    });

    expect(filesWritten.length).toBe(2);
    const dossier = await readFile(join(dir, "ideation-dossier.md"), "utf-8");
    expect(dossier).toContain("Ideation and Research Dossier");
    const seed = await readFile(join(agentDir, "Observations.md"), "utf-8");
    expect(seed).toContain("Rover");
  });
});
