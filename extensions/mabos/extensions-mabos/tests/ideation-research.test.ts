import { describe, expect, it } from "vitest";
import { gatherResearch, hasBackend } from "../src/ideation/research.js";

describe("IRC research wrapper", () => {
  it("returns analyst-only mode with no backend", async () => {
    const r = await gatherResearch({ questions: ["q1"], maxQueries: 5 });
    expect(r.mode).toBe("analyst-only");
    expect(r.raw).toBe("");
  });

  it("returns researched mode when a backend yields sources", async () => {
    const backend = {
      webSearch: async (_q: string) => [
        { url: "https://example.com", title: "Example", retrieved_at: "2026-05-28T00:00:00Z" },
      ],
    };
    const r = await gatherResearch({ questions: ["q1", "q2"], backend, maxQueries: 5 });
    expect(r.mode).toBe("researched");
    expect(r.raw).toContain("https://example.com");
  });

  it("collects per-query errors and continues", async () => {
    const backend = {
      webSearch: async (q: string) => {
        if (q === "boom") throw new Error("network down");
        return [{ url: "https://ok.com", title: "ok", retrieved_at: "2026-05-28T00:00:00Z" }];
      },
    };
    const r = await gatherResearch({ questions: ["boom", "good"], backend, maxQueries: 5 });
    expect(r.errors.length).toBe(1);
    expect(r.mode).toBe("researched"); // the good query still produced output
  });

  it("falls back to analyst-only when a backend produces nothing", async () => {
    const backend = { webSearch: async () => [] };
    const r = await gatherResearch({ questions: ["q"], backend, maxQueries: 5 });
    expect(r.mode).toBe("analyst-only");
  });

  it("hasBackend reflects available methods", () => {
    expect(hasBackend(undefined)).toBe(false);
    expect(hasBackend({})).toBe(false);
    expect(hasBackend({ webSearch: async () => [] })).toBe(true);
  });
});
