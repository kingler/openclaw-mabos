// scripts/setup-email-folders.ts
//
// One-time script: creates missing Inbox subfolders in the VividWalls mailbox.
// Run: bun scripts/setup-email-folders.ts

import {
  listFolders,
  listChildFolders,
  createFolder,
} from "../src/agents/tools/email-graph-client.js";

const REQUIRED_SUBFOLDERS = [
  "Customer Inquiries",
  "Orders & Shipping",
  "Returns & Refunds",
  "Corporate & B2B",
  "Supplier & Vendors",
  "SaaS & Platform",
  "Finance & Billing",
  "Legal & Compliance",
  "Newsletters & Marketing",
];

async function main() {
  console.log("Checking existing folders...");
  const topFolders = await listFolders();
  const inbox = topFolders.find((f) => f.displayName.toLowerCase() === "inbox");
  if (!inbox) {
    console.error("Inbox folder not found!");
    process.exit(1);
  }

  const existingChildren = await listChildFolders(inbox.id);
  const existingNames = new Set(existingChildren.map((f) => f.displayName));

  const missing = REQUIRED_SUBFOLDERS.filter((name) => !existingNames.has(name));

  if (missing.length === 0) {
    console.log("All required folders already exist.");
    return;
  }

  console.log(`Creating ${missing.length} missing folders: ${missing.join(", ")}`);

  for (const name of missing) {
    console.log(`  Creating folder "${name}"...`);
    const folder = await createFolder(inbox.id, name);
    console.log(`  Created: ${folder.displayName} (${folder.id})`);
  }

  console.log("Done. All folders created.");
}

main().catch(console.error);
