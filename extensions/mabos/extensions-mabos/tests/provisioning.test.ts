import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDeploy } from "../src/provisioning/deploy.js";
import { scaffoldInstance } from "../src/provisioning/scaffold.js";
import { ProvisioningStore } from "../src/provisioning/store.js";
import { ProvisionRequestSchema } from "../src/provisioning/types.js";
import type { ProvisionRequest } from "../src/provisioning/types.js";

function makeRequest(overrides: Partial<ProvisionRequest> = {}): ProvisionRequest {
  return {
    business_id: "acme",
    name: "Acme Inc",
    template: "base",
    company_dna: {
      business_description: "Acme sells widgets. We ship globally.",
      mission: "Widgets for all",
      vision: "A widget on every desk",
      industry: "ecommerce",
      stage: "growth",
      revenue: "$1M ARR",
      team_size: 12,
      key_products: ["Widget Pro"],
      channels: ["web"],
      constraints: [],
    },
    tool_inventory: [],
    ...overrides,
  } as ProvisionRequest;
}

describe("provisioning: request validation", () => {
  it("accepts a minimal valid request", () => {
    expect(Value.Check(ProvisionRequestSchema, makeRequest())).toBe(true);
  });

  it("rejects a request missing company_dna", () => {
    const bad = { business_id: "x", name: "X" };
    expect(Value.Check(ProvisionRequestSchema, bad)).toBe(false);
  });

  it("rejects an unknown deploy target", () => {
    const bad = makeRequest({ deploy: { target: "mars" } as never });
    expect(Value.Check(ProvisionRequestSchema, bad)).toBe(false);
  });
});

describe("provisioning: scaffold", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-prov-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("creates the business skeleton with manifest, agents, and GDC inputs", async () => {
    const res = await scaffoldInstance(ws, makeRequest());
    expect(res.agents).toContain("ceo");
    expect(res.agents).toHaveLength(9);

    const bizDir = join(ws, "businesses", "acme");
    const manifest = JSON.parse(await readFile(join(bizDir, "manifest.json"), "utf-8"));
    expect(manifest.id).toBe("acme");
    expect(manifest.status).toBe("provisioning");
    expect(manifest.agents).toContain("cfo");

    // GDC loaders read these back
    expect(existsSync(join(bizDir, "company_dna.json"))).toBe(true);
    expect(existsSync(join(bizDir, "tool_inventory.json"))).toBe(true);

    // Per-agent skeleton state
    const ceoFiles = await readdir(join(bizDir, "agents", "ceo"));
    expect(ceoFiles).toEqual(
      expect.arrayContaining(["inbox.json", "facts.json", "memory-store.json"]),
    );
  });

  it("writes integrations.json when integrations are provided", async () => {
    await scaffoldInstance(ws, makeRequest({ integrations: { stripe: { api_key: "sk_test" } } }));
    const path = join(ws, "businesses", "acme", "integrations.json");
    expect(JSON.parse(await readFile(path, "utf-8")).stripe.api_key).toBe("sk_test");
  });

  it("throws when the business already exists (idempotency)", async () => {
    await scaffoldInstance(ws, makeRequest());
    await expect(scaffoldInstance(ws, makeRequest())).rejects.toThrow(/already exists/);
  });
});

describe("provisioning: store", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-store-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("persists and lists instances and jobs", async () => {
    const store = new ProvisioningStore(ws);
    const now = new Date().toISOString();
    await store.saveInstance({
      id: "acme",
      name: "Acme",
      type: "ecommerce",
      template: "base",
      status: "provisioning",
      deploy: { target: "in-gateway" },
      agents: [],
      created_at: now,
      updated_at: now,
    });
    expect((await store.getInstance("acme"))?.name).toBe("Acme");
    expect(await store.listInstances()).toHaveLength(1);

    const job = store.newJob("acme");
    await store.saveJob(job);
    expect((await store.getJob(job.id))?.instance_id).toBe("acme");
  });
});

describe("provisioning: deploy renderers", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-deploy-"));
    await scaffoldInstance(ws, makeRequest());
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  const bizDir = () => join(ws, "businesses", "acme");

  it("in-gateway marks the manifest active", async () => {
    const out = await runDeploy({
      businessDir: bizDir(),
      instanceId: "acme",
      deploy: { target: "in-gateway", activate: true },
    });
    expect(out.target).toBe("in-gateway");
    const manifest = JSON.parse(await readFile(join(bizDir(), "manifest.json"), "utf-8"));
    expect(manifest.status).toBe("active");
  });

  it("container renders a compose file and a token", async () => {
    const out = await runDeploy({
      businessDir: bizDir(),
      instanceId: "acme",
      deploy: { target: "container" },
    });
    expect(out.artifacts).toContain("docker-compose.yml");
    expect(out.gateway_token).toMatch(/^mabos-/);
    expect(out.apply_command).toContain("docker compose");
    expect(existsSync(join(bizDir(), "deploy", "docker-compose.yml"))).toBe(true);
  });

  it("cloud/fly renders fly.toml with a unique app name", async () => {
    const out = await runDeploy({
      businessDir: bizDir(),
      instanceId: "acme",
      deploy: { target: "cloud", provider: "fly", region: "lhr" },
    });
    expect(out.artifacts).toContain("fly.toml");
    expect(out.base_url).toBe("https://mabos-acme.fly.dev");
    const toml = await readFile(join(bizDir(), "deploy", "fly.toml"), "utf-8");
    expect(toml).toContain('app = "mabos-acme"');
    expect(toml).toContain('primary_region = "lhr"');
  });

  it("cloud/render renders render.yaml", async () => {
    const out = await runDeploy({
      businessDir: bizDir(),
      instanceId: "acme",
      deploy: { target: "cloud", provider: "render" },
    });
    expect(out.artifacts).toContain("render.yaml");
    expect(existsSync(join(bizDir(), "deploy", "render.yaml"))).toBe(true);
  });
});
