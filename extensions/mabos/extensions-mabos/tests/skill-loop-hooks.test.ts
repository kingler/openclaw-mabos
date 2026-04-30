import { describe, it, assert } from "vitest";
import { registerSkillLoopHooks } from "../src/skill-loop/hooks.js";

function mockApi() {
  const hooks: Record<string, Function[]> = {};
  return {
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
    on(event: string, handler: Function) {
      hooks[event] = hooks[event] ?? [];
      hooks[event].push(handler);
    },
    _hooks: hooks,
  } as any;
}

function mockNudge(proposal: { name: string; confidence: number } | null = null) {
  let called = false;
  return {
    onSessionEnd: async () => {
      called = true;
      return proposal;
    },
    _wasCalled: () => called,
  };
}

function mockInjector(skills: { name: string; content: string }[] = []) {
  return {
    getRelevantSkills: async () => skills,
  };
}

describe("Skill Loop Hooks", () => {
  it("registers session_end hook for skill nudge", () => {
    const api = mockApi();
    registerSkillLoopHooks(api, {
      nudge: mockNudge() as any,
      injector: mockInjector() as any,
      config: {},
    });
    assert.ok(api._hooks["session_end"]?.length > 0);
  });

  it("session_end calls nudge.onSessionEnd", async () => {
    const api = mockApi();
    const nudge = mockNudge({ name: "campaign-builder", confidence: 0.85 });
    registerSkillLoopHooks(api, {
      nudge: nudge as any,
      injector: mockInjector() as any,
      config: {},
    });

    await api._hooks["session_end"][0]({
      taskDescription: "Created marketing campaign",
      toolsUsed: ["shopify_create"],
      outcome: "success",
    });

    assert.ok(nudge._wasCalled());
  });

  it("registers before_prompt_build when maxSkillsInPrompt > 0", () => {
    const api = mockApi();
    registerSkillLoopHooks(api, {
      nudge: mockNudge() as any,
      injector: mockInjector() as any,
      config: { maxSkillsInPrompt: 3 },
    });
    assert.ok(api._hooks["before_prompt_build"]?.length > 0);
  });

  it("does not register before_prompt_build when maxSkillsInPrompt is 0", () => {
    const api = mockApi();
    registerSkillLoopHooks(api, {
      nudge: mockNudge() as any,
      injector: mockInjector() as any,
      config: { maxSkillsInPrompt: 0 },
    });
    assert.equal(api._hooks["before_prompt_build"]?.length ?? 0, 0);
  });

  it("before_prompt_build injects skills into user messages", async () => {
    const api = mockApi();
    const skills = [{ name: "campaign-builder", content: "Steps for building campaigns" }];
    registerSkillLoopHooks(api, {
      nudge: mockNudge() as any,
      injector: mockInjector(skills) as any,
      config: { maxSkillsInPrompt: 3 },
    });

    const injectedMessages: any[] = [];
    const ctx: any = {
      taskHint: "marketing",
      agentRole: "vw-cmo",
      recentToolNames: [],
      appendUserMessage: (msg: any) => injectedMessages.push(msg),
    };
    await api._hooks["before_prompt_build"][0](ctx);

    assert.equal(injectedMessages.length, 1);
    assert.ok(injectedMessages[0].content.includes("[SKILL: campaign-builder]"));
    assert.ok(injectedMessages[0].meta.skillInjection);
  });

  it("before_prompt_build skips when no relevant skills found", async () => {
    const api = mockApi();
    registerSkillLoopHooks(api, {
      nudge: mockNudge() as any,
      injector: mockInjector([]) as any,
      config: { maxSkillsInPrompt: 3 },
    });

    const injectedMessages: any[] = [];
    const ctx: any = {
      appendUserMessage: (msg: any) => injectedMessages.push(msg),
    };
    await api._hooks["before_prompt_build"][0](ctx);

    assert.equal(injectedMessages.length, 0);
  });
});
