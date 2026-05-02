import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { NaryFactStore } from "../src/cognitive/assimilation/nary-store.js";

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), "nary-"));
  return new NaryFactStore(join(dir, "nary.json"));
}

describe("NaryFactStore", () => {
  it("asserts and counts n-ary facts by role-value filter", async () => {
    const store = freshStore();
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-001",
        print: "vw:ArtPrint/p1",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-002",
        print: "vw:ArtPrint/p2",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-003",
        print: "vw:ArtPrint/p3",
        edition: "vw:Edition/other-edition",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    const n = await store.countNary("vw:coaIssuanceFact", { edition: "vw:Edition/sb-3" });
    expect(n).toBe(2);
  });

  it("returns 0 when no facts match", async () => {
    const store = freshStore();
    expect(await store.countNary("vw:coaIssuanceFact", { edition: "vw:Edition/none" })).toBe(0);
  });

  it("queryNary returns matching n-tuples", async () => {
    const store = freshStore();
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-001",
        print: "vw:ArtPrint/p1",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    const results = await store.queryNary("vw:coaIssuanceFact", {
      edition: "vw:Edition/sb-3",
    });
    expect(results).toHaveLength(1);
    expect(results[0].roles.certificate).toBe("vw:CertificateOfAuthenticity/coa-001");
  });

  it("dedupes on identical role tuples", async () => {
    const store = freshStore();
    const fact = {
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-001",
        print: "vw:ArtPrint/p1",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    };
    const first = await store.assertNary(fact);
    const second = await store.assertNary(fact);
    expect(first.action).toBe("asserted");
    expect(second.action).toBe("deduped");
    expect(await store.countNary("vw:coaIssuanceFact", {})).toBe(1);
  });

  it("survives reload: facts written by one instance are visible to another", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nary-"));
    const path = join(dir, "nary.json");
    const a = new NaryFactStore(path);
    await a.assertNary({
      factTypeId: "test:fact",
      roles: { x: "1", y: "2" },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    const b = new NaryFactStore(path);
    expect(await b.countNary("test:fact", { x: "1" })).toBe(1);
  });
});
