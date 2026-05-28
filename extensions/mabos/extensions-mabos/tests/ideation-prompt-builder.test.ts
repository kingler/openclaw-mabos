import { describe, expect, it } from "vitest";
import {
  buildIrcPrompt,
  buildValidationPrompt,
  computeInputHash,
} from "../src/ideation/prompt-builder.js";

describe("IRC prompt builder", () => {
  it("substitutes variables in the stage 1 template", () => {
    const { system, user } = buildIrcPrompt(1, {
      raw_idea: "An app that books dog walkers",
      industry_hint: "pet services",
    });
    expect(system).toContain("Jobs-to-be-Done");
    expect(user).toContain("An app that books dog walkers");
    expect(user).not.toContain("{{raw_idea}}");
  });

  it("leaves no unresolved placeholders", () => {
    const { system, user } = buildIrcPrompt(2, { mode: "analyst-only" });
    expect(system).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(user).not.toMatch(/\{\{[a-z_]+\}\}/);
  });

  it("builds the validation prompt for a persona", () => {
    const { system } = buildValidationPrompt({
      persona: "customer",
      thesis: "{}",
      research_context: "",
    });
    expect(system).toContain("customer");
    expect(system).toContain("DESIRABILITY");
  });

  it("throws on an unknown stage", () => {
    expect(() => buildIrcPrompt(9)).toThrow(/Unknown IRC stage/);
  });

  it("produces deterministic input hashes", () => {
    const a = computeInputHash({ x: 1 });
    const b = computeInputHash({ x: 1 });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });
});
