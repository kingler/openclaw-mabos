import { describe, it, assert, vi } from "vitest";
import { registerSessionIntelHooks } from "../src/session-intel/hooks.js";

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

function mockIndex() {
  const sessions: any[] = [];
  const messages: any[] = [];
  return {
    indexSession(s: any) {
      sessions.push(s);
    },
    indexMessage(m: any) {
      messages.push(m);
    },
    _sessions: sessions,
    _messages: messages,
  };
}

function mockUserModel(profileText = "User prefers concise responses") {
  let sessionEndCalled = false;
  return {
    onSessionEnd: async () => {
      sessionEndCalled = true;
      return true;
    },
    getProfileSection: async () => profileText,
    _wasCalledOnSessionEnd: () => sessionEndCalled,
  };
}

describe("Session Intel Hooks", () => {
  it("registers session_end hook for FTS indexing", () => {
    const api = mockApi();
    registerSessionIntelHooks(api, {
      index: mockIndex() as any,
      userModel: null,
      config: { fts: { enabled: true } },
    });
    assert.ok(api._hooks["session_end"]?.length > 0);
  });

  it("session_end indexes session and messages", async () => {
    const api = mockApi();
    const index = mockIndex();
    registerSessionIntelHooks(api, {
      index: index as any,
      userModel: null,
      config: { fts: { enabled: true } },
    });

    await api._hooks["session_end"][0]({
      sessionId: "s-1",
      agentId: "vw-cmo",
      companyId: "vividwalls",
      messages: [
        { role: "user", content: "Create a campaign" },
        { role: "assistant", content: "Done!" },
      ],
    });

    assert.equal(index._sessions.length, 1);
    assert.equal(index._sessions[0].agentId, "vw-cmo");
    assert.equal(index._messages.length, 2);
    assert.equal(index._messages[0].content, "Create a campaign");
  });

  it("registers user model hooks when userModel provided", () => {
    const api = mockApi();
    registerSessionIntelHooks(api, {
      index: mockIndex() as any,
      userModel: mockUserModel() as any,
      config: { fts: { enabled: true } },
    });
    // session_end (fts) + session_end (user model) = 2
    assert.equal(api._hooks["session_end"].length, 2);
    assert.ok(api._hooks["before_prompt_build"]?.length > 0);
  });

  it("before_prompt_build injects user profile section", async () => {
    const api = mockApi();
    registerSessionIntelHooks(api, {
      index: mockIndex() as any,
      userModel: mockUserModel("Prefers brief answers") as any,
      config: { fts: { enabled: true } },
    });

    let injectedSection: string | null = null;
    const ctx: any = {
      appendSystemSection: (_key: string, content: string) => {
        injectedSection = content;
      },
    };
    await api._hooks["before_prompt_build"][0](ctx);

    assert.equal(injectedSection, "Prefers brief answers");
  });

  it("does not register FTS hooks when disabled", () => {
    const api = mockApi();
    registerSessionIntelHooks(api, {
      index: mockIndex() as any,
      userModel: null,
      config: { fts: { enabled: false } },
    });
    assert.equal(api._hooks["session_end"]?.length ?? 0, 0);
  });
});
