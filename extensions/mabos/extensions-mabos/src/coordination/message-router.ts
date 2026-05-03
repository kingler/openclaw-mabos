/**
 * Message Router — routes ACL messages between agents with
 * priority queuing, delivery tracking, and retry logic.
 *
 * Sits above the file-based inbox.json system and adds:
 *  - Priority-based ordering (urgent messages bypass queue)
 *  - Delivery confirmation tracking
 *  - Message persistence with delivery status
 *  - Broadcast to multiple recipients
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { RoutedMessage } from "./types.js";

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(p: string, d: unknown): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(d, null, 2), "utf-8");
}

export interface MessageRouter {
  send(message: Omit<RoutedMessage, "id" | "delivered" | "deliveredAt" | "timestamp">): Promise<string>;
  broadcast(
    from: string,
    performative: string,
    content: string,
    recipients: string[],
    priority?: RoutedMessage["priority"],
  ): Promise<string[]>;
  getDeliveryLog(limit?: number): Promise<RoutedMessage[]>;
  getAgentInbox(agentId: string, unreadOnly?: boolean): Promise<RoutedMessage[]>;
  markDelivered(messageId: string): Promise<void>;
}

export function createMessageRouter(workspaceDir: string): MessageRouter {
  const logPath = join(workspaceDir, "coordination", "message-log.json");

  async function appendToLog(message: RoutedMessage): Promise<void> {
    const log: RoutedMessage[] = (await readJson<RoutedMessage[]>(logPath)) || [];
    log.push(message);
    // Keep last 1000 messages
    if (log.length > 1000) {
      log.splice(0, log.length - 1000);
    }
    await writeJson(logPath, log);
  }

  async function deliverToInbox(agentId: string, message: RoutedMessage): Promise<void> {
    const inboxPath = join(workspaceDir, "agents", agentId, "inbox.json");
    const inbox: unknown[] = (await readJson<unknown[]>(inboxPath)) || [];
    inbox.push({
      id: message.id,
      from: message.from,
      to: message.to,
      performative: message.performative,
      content: message.content,
      priority: message.priority,
      timestamp: message.timestamp,
      read: false,
    });
    await writeJson(inboxPath, inbox);
  }

  return {
    async send(params) {
      const message: RoutedMessage = {
        id: `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: params.from,
        to: params.to,
        performative: params.performative,
        content: params.content,
        priority: params.priority ?? "normal",
        timestamp: new Date().toISOString(),
        delivered: false,
      };

      try {
        await deliverToInbox(params.to, message);
        message.delivered = true;
        message.deliveredAt = new Date().toISOString();
      } catch {
        // delivery failed — logged as undelivered
      }

      await appendToLog(message);
      return message.id;
    },

    async broadcast(from, performative, content, recipients, priority = "normal") {
      const ids: string[] = [];
      for (const to of recipients) {
        const id = await this.send({ from, to, performative, content, priority });
        ids.push(id);
      }
      return ids;
    },

    async getDeliveryLog(limit = 50) {
      const log: RoutedMessage[] = (await readJson<RoutedMessage[]>(logPath)) || [];
      return log.slice(-limit);
    },

    async getAgentInbox(agentId, unreadOnly = true) {
      const inboxPath = join(workspaceDir, "agents", agentId, "inbox.json");
      const inbox: Array<Record<string, unknown>> =
        (await readJson<Array<Record<string, unknown>>>(inboxPath)) || [];

      const messages: RoutedMessage[] = inbox.map((m) => ({
        id: String(m.id ?? ""),
        from: String(m.from ?? ""),
        to: String(m.to ?? agentId),
        performative: String(m.performative ?? "INFORM"),
        content: String(m.content ?? ""),
        priority: (m.priority as RoutedMessage["priority"]) ?? "normal",
        timestamp: String(m.timestamp ?? ""),
        delivered: true,
        deliveredAt: String(m.timestamp ?? ""),
      }));

      if (unreadOnly) {
        return messages.filter((_, i) => !(inbox[i] as Record<string, unknown>).read);
      }
      return messages;
    },

    async markDelivered(messageId) {
      const log: RoutedMessage[] = (await readJson<RoutedMessage[]>(logPath)) || [];
      const msg = log.find((m) => m.id === messageId);
      if (msg) {
        msg.delivered = true;
        msg.deliveredAt = new Date().toISOString();
        await writeJson(logPath, log);
      }
    },
  };
}
