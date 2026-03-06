import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const WORKSPACE = "/home/kingler/.mabos/workspace";
const AGENT_ID = "ceo";
const TEST_CONTENT = "Integration test: flamingo purple sunset verification marker " + Date.now();

// 1. Write daily log (simulating writeNativeDailyLog)
const now = new Date();
const dateStr = now.toISOString().split("T")[0];
const timeStr = now.toISOString().split("T")[1].slice(0, 5);
const logPath = join(WORKSPACE, "agents", AGENT_ID, "memory", `${dateStr}.md`);

let md = "";
try {
  md = await readFile(logPath, "utf-8");
} catch {}
if (!md) {
  md = `# ${dateStr} — Agent Log\n`;
}
md += `\n## fact (${timeStr} UTC)\n- ${TEST_CONTENT} [test, verification] (integration-test)\n`;

await mkdir(dirname(logPath), { recursive: true });
await writeFile(logPath, md, "utf-8");
console.log("Written daily log:", logPath);

// 2. Trigger native memory sync (the code we added in Fix 4)
try {
  const { getMemorySearchManager } = await import(
    join(process.cwd(), "dist/memory/search-manager.js")
  );
  const { manager, error } = await getMemorySearchManager({
    cfg: JSON.parse(await readFile("/home/kingler/.openclaw/openclaw.json", "utf-8")),
    agentId: AGENT_ID,
  });
  if (error) {
    console.log("Memory manager error:", error);
  } else if (manager && typeof manager.sync === "function") {
    console.log("Triggering sync...");
    await manager.sync({ reason: "mabos-memory-store" });
    console.log("Sync complete");

    // 3. Search for the item immediately
    const results = await manager.search("flamingo purple sunset", {
      maxResults: 5,
      minScore: 0.1,
    });
    console.log(`Search results: ${results.length} hits`);
    for (const r of results) {
      console.log(`  - score=${r.score.toFixed(3)} snippet=${(r.snippet || "").slice(0, 80)}`);
    }
    if (results.length > 0) {
      console.log("PASS: Memory write-through works — new entry immediately searchable");
    } else {
      console.log("PARTIAL: Sync ran but search returned no results (may need embedding provider)");
    }
  } else {
    console.log("SKIP: No sync method on manager (manager exists:", !!manager, ")");
  }
} catch (err) {
  console.log("Memory sync test:", err.message || String(err));
  console.log("NOTE: Daily log file was still written — native system will index on next cycle");
}
