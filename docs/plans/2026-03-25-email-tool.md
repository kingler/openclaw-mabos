# Email Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give MABOS agents the ability to read, send, reply, forward, move, and categorize emails in the kingler@vividwalls.co mailbox via Microsoft Graph API.

**Architecture:** Three files — a Graph Mail API client for auth + HTTP calls, an action handler following the slack-actions.ts pattern, and a tool definition registered in openclaw-tools.ts. Uses OAuth2 client credentials flow with existing MS*GRAPH*\* env vars.

**Tech Stack:** Microsoft Graph API v1.0, OAuth2 client_credentials grant, Node.js fetch API, TypeBox schemas

---

### Task 1: Email Graph Client — Auth & Core API

**Files:**

- Create: `src/agents/tools/email-graph-client.ts`

**Step 1: Create the Graph Mail client with OAuth2 token acquisition and core API methods**

```typescript
// src/agents/tools/email-graph-client.ts

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

type GraphMailCredentials = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  userEmail: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function resolveMailCredentials(): GraphMailCredentials {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim();
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim();
  const userEmail = process.env.MS_GRAPH_USER_EMAIL?.trim();
  if (!tenantId || !clientId || !clientSecret || !userEmail) {
    throw new Error(
      "MS Graph credentials missing. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MS_GRAPH_USER_EMAIL in .env",
    );
  }
  return { tenantId, clientId, clientSecret, userEmail };
}

async function acquireToken(creds: GraphMailCredentials): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const url = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token acquisition failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.token;
}

async function graphFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const creds = resolveMailCredentials();
  const token = await acquireToken(creds);
  const res = await fetch(`${GRAPH_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph API ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

function userPath(): string {
  const creds = resolveMailCredentials();
  return `/users/${encodeURIComponent(creds.userEmail)}`;
}

// --- Public API ---

export type GraphMessage = {
  id: string;
  subject: string;
  from?: { emailAddress: { name: string; address: string } };
  toRecipients?: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  categories?: string[];
  parentFolderId?: string;
  hasAttachments?: boolean;
};

export type GraphFolder = {
  id: string;
  displayName: string;
  totalItemCount: number;
  unreadItemCount: number;
};

export async function listEmails(options?: {
  folderId?: string;
  top?: number;
  skip?: number;
  search?: string;
  filter?: string;
  select?: string;
}): Promise<{ messages: GraphMessage[]; totalCount?: number }> {
  const base = options?.folderId
    ? `${userPath()}/mailFolders/${encodeURIComponent(options.folderId)}/messages`
    : `${userPath()}/messages`;
  const params = new URLSearchParams();
  params.set("$top", String(options?.top ?? 10));
  if (options?.skip) params.set("$skip", String(options.skip));
  if (options?.search) params.set("$search", `"${options.search}"`);
  if (options?.filter) params.set("$filter", options.filter);
  params.set(
    "$select",
    options?.select ??
      "id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,categories,parentFolderId,hasAttachments",
  );
  params.set("$orderby", "receivedDateTime desc");
  params.set("$count", "true");
  const result = await graphFetch<{ value: GraphMessage[]; "@odata.count"?: number }>(
    `${base}?${params.toString()}`,
    { headers: { ConsistencyLevel: "eventual" } },
  );
  return { messages: result.value ?? [], totalCount: result["@odata.count"] };
}

export async function readEmail(messageId: string): Promise<GraphMessage> {
  return graphFetch<GraphMessage>(
    `${userPath()}/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,receivedDateTime,isRead,body,bodyPreview,categories,parentFolderId,hasAttachments`,
  );
}

export async function sendEmail(params: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  bodyType?: "Text" | "HTML";
}): Promise<void> {
  const toRecipients = params.to.map((addr) => ({
    emailAddress: { address: addr },
  }));
  const ccRecipients = params.cc?.map((addr) => ({
    emailAddress: { address: addr },
  }));
  await graphFetch(`${userPath()}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: params.bodyType ?? "Text", content: params.body },
        toRecipients,
        ...(ccRecipients?.length ? { ccRecipients } : {}),
      },
    }),
  });
}

export async function replyToEmail(messageId: string, comment: string): Promise<void> {
  await graphFetch(`${userPath()}/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export async function forwardEmail(
  messageId: string,
  to: string[],
  comment?: string,
): Promise<void> {
  const toRecipients = to.map((addr) => ({
    emailAddress: { address: addr },
  }));
  await graphFetch(`${userPath()}/messages/${encodeURIComponent(messageId)}/forward`, {
    method: "POST",
    body: JSON.stringify({ comment: comment ?? "", toRecipients }),
  });
}

export async function moveEmail(
  messageId: string,
  destinationFolderId: string,
): Promise<GraphMessage> {
  return graphFetch<GraphMessage>(`${userPath()}/messages/${encodeURIComponent(messageId)}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: destinationFolderId }),
  });
}

export async function categorizeEmail(
  messageId: string,
  categories: string[],
): Promise<GraphMessage> {
  return graphFetch<GraphMessage>(`${userPath()}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ categories }),
  });
}

export async function listFolders(): Promise<GraphFolder[]> {
  const result = await graphFetch<{ value: GraphFolder[] }>(
    `${userPath()}/mailFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount`,
  );
  return result.value ?? [];
}

export async function listChildFolders(parentFolderId: string): Promise<GraphFolder[]> {
  const result = await graphFetch<{ value: GraphFolder[] }>(
    `${userPath()}/mailFolders/${encodeURIComponent(parentFolderId)}/childFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount`,
  );
  return result.value ?? [];
}

export async function markAsRead(messageId: string, isRead: boolean): Promise<void> {
  await graphFetch(`${userPath()}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead }),
  });
}
```

**Step 2: Verify file was created**

Run: `ls -la src/agents/tools/email-graph-client.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add src/agents/tools/email-graph-client.ts
git commit -m "feat(email): add MS Graph Mail API client with OAuth2 auth"
```

---

### Task 2: Email Action Handler

**Files:**

- Create: `src/agents/tools/email-actions.ts`

**Step 1: Create the action handler following the slack-actions.ts pattern**

```typescript
// src/agents/tools/email-actions.ts

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import {
  categorizeEmail,
  forwardEmail,
  listChildFolders,
  listEmails,
  listFolders,
  markAsRead,
  moveEmail,
  readEmail,
  replyToEmail,
  sendEmail,
} from "./email-graph-client.js";
import {
  jsonResult,
  readNumberParam,
  readStringArrayParam,
  readStringParam,
  ToolInputError,
} from "./common.js";

export async function handleEmailAction(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });

  switch (action) {
    case "list": {
      const folder = readStringParam(params, "folder");
      const search = readStringParam(params, "search");
      const filter = readStringParam(params, "filter");
      const top = readNumberParam(params, "top", { integer: true }) ?? 10;
      const skip = readNumberParam(params, "skip", { integer: true });

      // Resolve folder name to ID if needed
      let folderId = folder;
      if (folder && !folder.startsWith("AAMk")) {
        folderId = await resolveFolderIdByName(folder);
      }

      const result = await listEmails({ folderId, top, skip, search, filter });
      const summary = result.messages.map((m) => ({
        id: m.id,
        subject: m.subject,
        from: m.from?.emailAddress?.address,
        fromName: m.from?.emailAddress?.name,
        date: m.receivedDateTime,
        isRead: m.isRead,
        preview: m.bodyPreview?.slice(0, 150),
        categories: m.categories,
        hasAttachments: m.hasAttachments,
      }));
      return jsonResult({
        ok: true,
        count: summary.length,
        totalCount: result.totalCount,
        messages: summary,
      });
    }

    case "read": {
      const messageId = readStringParam(params, "messageId", { required: true });
      const message = await readEmail(messageId);
      // Auto-mark as read
      if (!message.isRead) {
        await markAsRead(messageId, true).catch(() => {});
      }
      // Strip HTML tags for text-friendly output
      const bodyText =
        message.body?.contentType === "HTML"
          ? stripHtml(message.body.content)
          : (message.body?.content ?? message.bodyPreview);
      return jsonResult({
        ok: true,
        message: {
          id: message.id,
          subject: message.subject,
          from: message.from?.emailAddress?.address,
          fromName: message.from?.emailAddress?.name,
          to: message.toRecipients?.map((r) => r.emailAddress.address),
          date: message.receivedDateTime,
          body: bodyText,
          categories: message.categories,
          hasAttachments: message.hasAttachments,
        },
      });
    }

    case "reply": {
      const messageId = readStringParam(params, "messageId", { required: true });
      const comment = readStringParam(params, "body", { required: true });
      await replyToEmail(messageId, comment);
      return jsonResult({ ok: true, action: "replied", messageId });
    }

    case "send": {
      const to = readStringArrayParam(params, "to", { required: true });
      const subject = readStringParam(params, "subject", { required: true });
      const body = readStringParam(params, "body", { required: true });
      const cc = readStringArrayParam(params, "cc");
      const bodyType =
        readStringParam(params, "bodyType") === "HTML" ? ("HTML" as const) : ("Text" as const);
      await sendEmail({ to, cc, subject, body, bodyType });
      return jsonResult({ ok: true, action: "sent", to, subject });
    }

    case "forward": {
      const messageId = readStringParam(params, "messageId", { required: true });
      const to = readStringArrayParam(params, "to", { required: true });
      const comment = readStringParam(params, "comment");
      await forwardEmail(messageId, to, comment);
      return jsonResult({ ok: true, action: "forwarded", messageId, to });
    }

    case "move": {
      const messageId = readStringParam(params, "messageId", { required: true });
      const folder = readStringParam(params, "folder", { required: true });
      let folderId = folder;
      if (!folder.startsWith("AAMk")) {
        folderId = await resolveFolderIdByName(folder);
        if (!folderId) {
          throw new ToolInputError(
            `Folder "${folder}" not found. Use email action="listFolders" to see available folders.`,
          );
        }
      }
      const result = await moveEmail(messageId, folderId);
      return jsonResult({ ok: true, action: "moved", messageId, folder });
    }

    case "categorize": {
      const messageId = readStringParam(params, "messageId", { required: true });
      const categories = readStringArrayParam(params, "categories", { required: true });
      const result = await categorizeEmail(messageId, categories);
      return jsonResult({
        ok: true,
        action: "categorized",
        messageId,
        categories: result.categories,
      });
    }

    case "listFolders": {
      const parentFolder = readStringParam(params, "parentFolder");
      let folders;
      if (parentFolder) {
        let parentId = parentFolder;
        if (!parentFolder.startsWith("AAMk")) {
          parentId = await resolveFolderIdByName(parentFolder);
          if (!parentId) {
            throw new ToolInputError(`Parent folder "${parentFolder}" not found.`);
          }
        }
        folders = await listChildFolders(parentId);
      } else {
        folders = await listFolders();
      }
      return jsonResult({
        ok: true,
        folders: folders.map((f) => ({
          id: f.id,
          name: f.displayName,
          total: f.totalItemCount,
          unread: f.unreadItemCount,
        })),
      });
    }

    default:
      throw new ToolInputError(
        `Unknown email action: "${action}". Valid actions: list, read, reply, send, forward, move, categorize, listFolders`,
      );
  }
}

// --- Helpers ---

async function resolveFolderIdByName(name: string): Promise<string> {
  const allFolders = await listFolders();
  // Check top-level folders first
  const match = allFolders.find((f) => f.displayName.toLowerCase() === name.toLowerCase());
  if (match) return match.id;

  // Check child folders of Inbox
  const inbox = allFolders.find((f) => f.displayName.toLowerCase() === "inbox");
  if (inbox) {
    const children = await listChildFolders(inbox.id);
    const childMatch = children.find((f) => f.displayName.toLowerCase() === name.toLowerCase());
    if (childMatch) return childMatch.id;
  }

  throw new ToolInputError(
    `Folder "${name}" not found. Use email action="listFolders" to see available folders.`,
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
```

**Step 2: Verify file was created**

Run: `ls -la src/agents/tools/email-actions.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add src/agents/tools/email-actions.ts
git commit -m "feat(email): add email action handler with 8 actions"
```

---

### Task 3: Email Tool Definition

**Files:**

- Create: `src/agents/tools/email-tool.ts`

**Step 1: Create the tool definition with TypeBox schema**

```typescript
// src/agents/tools/email-tool.ts

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { handleEmailAction } from "./email-actions.js";

export function createEmailTool(): AnyAgentTool {
  return {
    name: "email",
    description: `Manage the VividWalls business email (kingler@vividwalls.co) via Microsoft Outlook/Exchange.

Actions:
- list: List/search inbox messages. Params: folder?, search?, filter?, top? (default 10), skip?
- read: Read full email content. Params: messageId (required)
- reply: Reply to an email. Params: messageId (required), body (required)
- send: Send a new email. Params: to (required, array), subject (required), body (required), cc?, bodyType? ("Text"|"HTML")
- forward: Forward an email. Params: messageId (required), to (required, array), comment?
- move: Move email to a folder. Params: messageId (required), folder (required, name or ID)
- categorize: Set categories/tags on email. Params: messageId (required), categories (required, array). Available: Urgent, Pending Response, Resolved, New Customer, VIP, Custom Order, Follow Up
- listFolders: List mail folders. Params: parentFolder? (name or ID, omit for top-level)

Inbox subfolders: Customer Inquiries, Orders & Shipping, Corporate & B2B, Returns & Refunds, Newsletters & Marketing`,
    parameters: Type.Object({
      action: Type.String({
        description:
          "The email action to perform: list, read, reply, send, forward, move, categorize, listFolders",
      }),
      messageId: Type.Optional(
        Type.String({ description: "Email message ID (from list results)" }),
      ),
      to: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description: "Recipient email address(es)",
        }),
      ),
      cc: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description: "CC recipient email address(es)",
        }),
      ),
      subject: Type.Optional(Type.String({ description: "Email subject" })),
      body: Type.Optional(Type.String({ description: "Email body content or reply text" })),
      bodyType: Type.Optional(
        Type.String({ description: "Body content type: Text (default) or HTML" }),
      ),
      comment: Type.Optional(Type.String({ description: "Comment when forwarding" })),
      folder: Type.Optional(
        Type.String({
          description: "Folder name or ID for list/move actions",
        }),
      ),
      parentFolder: Type.Optional(Type.String({ description: "Parent folder for listFolders" })),
      categories: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description: "Category names to apply",
        }),
      ),
      search: Type.Optional(Type.String({ description: "Search query for list action" })),
      filter: Type.Optional(Type.String({ description: "OData filter for list action" })),
      top: Type.Optional(Type.Number({ description: "Max results to return (default 10)" })),
      skip: Type.Optional(Type.Number({ description: "Number of results to skip (pagination)" })),
    }),
    execute: async (_params, _abortSignal) => {
      const params = _params as Record<string, unknown>;
      return handleEmailAction(params);
    },
  };
}
```

**Step 2: Verify file was created**

Run: `ls -la src/agents/tools/email-tool.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add src/agents/tools/email-tool.ts
git commit -m "feat(email): add email tool definition with TypeBox schema"
```

---

### Task 4: Register Email Tool in openclaw-tools.ts

**Files:**

- Modify: `src/agents/openclaw-tools.ts`

**Step 1: Add import and registration**

Add import at top of file (after the other tool imports):

```typescript
import { createEmailTool } from "./tools/email-tool.js";
```

Add to the `tools` array (after the pdfTool spread, before the closing `];`):

```typescript
    ...(pdfTool ? [pdfTool] : []),
    createEmailTool(),
  ];
```

**Step 2: Verify the import and registration were added**

Run: `grep -n 'email' src/agents/openclaw-tools.ts`
Expected: Shows the import line and createEmailTool() call

**Step 3: Commit**

```bash
git add src/agents/openclaw-tools.ts
git commit -m "feat(email): register email tool in openclaw-tools factory"
```

---

### Task 5: Verify & Test

**Step 1: TypeScript compilation check**

Run: `npx tsc --noEmit src/agents/tools/email-graph-client.ts src/agents/tools/email-actions.ts src/agents/tools/email-tool.ts`
Expected: No errors

**Step 2: Restart the MABOS server**

Run: `pm2 restart openclaw-mabos` (or however the server is managed)

**Step 3: Test via agent chat**

Send to any agent: "List the emails in the inbox"
Expected: Agent uses the email tool with action="list" and returns inbox messages

**Step 4: Test folder listing**

Send: "List the email folders"
Expected: Returns the 5 subfolders we created (Customer Inquiries, Orders & Shipping, etc.)

**Step 5: Final commit with all verified**

```bash
git add -A
git commit -m "feat(email): complete email tool - 8 actions, Graph API, folder & category support"
```
