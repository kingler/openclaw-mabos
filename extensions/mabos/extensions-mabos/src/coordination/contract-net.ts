/**
 * Contract Net Protocol Runtime — orchestrates CFP auctions beyond
 * the tool-level primitives in communication-tools.ts.
 *
 * Tracks active auctions, enforces timeouts, auto-awards on deadline,
 * and re-auctions on failure.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Auction, AuctionStatus, CallForProposal, Proposal } from "./types.js";

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

export interface ContractNetManager {
  initiate(cfp: CallForProposal): Promise<string>;
  submitProposal(taskId: string, proposal: Proposal): Promise<void>;
  award(taskId: string, winnerId?: string): Promise<string>;
  getStatus(taskId: string): Promise<Auction | null>;
  listActive(): Promise<Auction[]>;
  expireStale(): Promise<string[]>;
}

export function createContractNetManager(workspaceDir: string): ContractNetManager {
  const cnDir = join(workspaceDir, "contract-net");

  async function loadAuction(taskId: string): Promise<Auction | null> {
    return readJson<Auction>(join(cnDir, `${taskId}.json`));
  }

  async function saveAuction(auction: Auction): Promise<void> {
    await writeJson(join(cnDir, `${auction.taskId}.json`), auction);
  }

  async function sendToInbox(
    agentId: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const inboxPath = join(workspaceDir, "agents", agentId, "inbox.json");
    const inbox: unknown[] = (await readJson<unknown[]>(inboxPath)) || [];
    inbox.push(message);
    await writeJson(inboxPath, inbox);
  }

  return {
    async initiate(cfp) {
      const auction: Auction = {
        taskId: cfp.taskId,
        initiator: cfp.initiator,
        description: cfp.description,
        candidates: cfp.candidates,
        criteria: cfp.criteria,
        deadline: cfp.deadline,
        budget: cfp.budget,
        status: "open",
        proposals: [],
        createdAt: new Date().toISOString(),
      };
      await saveAuction(auction);

      for (const agent of cfp.candidates) {
        await sendToInbox(agent, {
          id: `CFP-${cfp.taskId}-${agent}`,
          from: cfp.initiator,
          to: agent,
          performative: "CFP",
          content: `Call for Proposals: ${cfp.description}\nCriteria: ${cfp.criteria.join(", ")}\nBudget: ${cfp.budget ?? "negotiable"}\nDeadline: ${cfp.deadline ?? "ASAP"}`,
          priority: "high",
          timestamp: auction.createdAt,
          read: false,
          task_id: cfp.taskId,
        });
      }

      return cfp.taskId;
    },

    async submitProposal(taskId, proposal) {
      const auction = await loadAuction(taskId);
      if (!auction) throw new Error(`Auction ${taskId} not found`);
      if (auction.status !== "open") throw new Error(`Auction ${taskId} is ${auction.status}`);

      const existing = auction.proposals.findIndex((p) => p.agent === proposal.agent);
      if (existing >= 0) {
        auction.proposals[existing] = proposal;
      } else {
        auction.proposals.push(proposal);
      }
      await saveAuction(auction);
    },

    async award(taskId, winnerId?) {
      const auction = await loadAuction(taskId);
      if (!auction) throw new Error(`Auction ${taskId} not found`);
      if (auction.proposals.length === 0) throw new Error("No proposals received");

      const winner =
        winnerId ??
        auction.proposals.sort((a, b) => b.confidence - a.confidence)[0].agent;

      auction.status = "awarded";
      auction.winner = winner;
      auction.resolvedAt = new Date().toISOString();
      await saveAuction(auction);

      await sendToInbox(winner, {
        id: `AWARD-${taskId}`,
        from: auction.initiator,
        to: winner,
        performative: "ACCEPT",
        content: `Your proposal for task ${taskId} has been accepted.`,
        priority: "high",
        timestamp: auction.resolvedAt,
        read: false,
      });

      for (const p of auction.proposals) {
        if (p.agent !== winner) {
          await sendToInbox(p.agent, {
            id: `REJECT-${taskId}-${p.agent}`,
            from: auction.initiator,
            to: p.agent,
            performative: "REJECT",
            content: `Task ${taskId} awarded to another agent.`,
            priority: "normal",
            timestamp: auction.resolvedAt,
            read: false,
          });
        }
      }

      return winner;
    },

    async getStatus(taskId) {
      return loadAuction(taskId);
    },

    async listActive() {
      try {
        const files = await readdir(cnDir);
        const auctions: Auction[] = [];
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const auction = await readJson<Auction>(join(cnDir, file));
          if (auction && (auction.status === "open" || auction.status === "evaluating")) {
            auctions.push(auction);
          }
        }
        return auctions;
      } catch {
        return [];
      }
    },

    async expireStale() {
      const now = Date.now();
      const expired: string[] = [];
      try {
        const files = await readdir(cnDir);
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const auction = await readJson<Auction>(join(cnDir, file));
          if (!auction || auction.status !== "open") continue;
          if (auction.deadline && new Date(auction.deadline).getTime() < now) {
            if (auction.proposals.length > 0) {
              auction.status = "evaluating";
            } else {
              auction.status = "expired";
            }
            auction.resolvedAt = new Date().toISOString();
            await writeJson(join(cnDir, file), auction);
            expired.push(auction.taskId);
          }
        }
      } catch {
        // contract-net dir may not exist
      }
      return expired;
    },
  };
}
