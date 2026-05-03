/**
 * MABOS Event Bus — cross-subsystem pub/sub with persistence.
 *
 * Replaces the minimal EventEmitter stub with a typed bus that:
 *  - Routes events by type/subsystem/agent
 *  - Persists events to JSONL for replay
 *  - Enforces bounded buffer (backpressure)
 *  - Supports filtered subscriptions
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface MabosEvent {
  id: string;
  type: string;
  source: string;
  agentId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type EventFilter = {
  types?: string[];
  sources?: string[];
  agentIds?: string[];
};

type EventHandler = (event: MabosEvent) => void;

export interface MabosEventBus {
  emit(event: Omit<MabosEvent, "id" | "timestamp">): void;
  on(type: string, handler: EventHandler): () => void;
  subscribe(filter: EventFilter, handler: EventHandler): () => void;
  getRecent(limit?: number): MabosEvent[];
  stop(): void;
}

export function createMabosEventBus(opts: {
  persistDir?: string;
  maxBufferSize?: number;
}): MabosEventBus {
  const maxBuffer = opts.maxBufferSize ?? 10_000;
  const buffer: MabosEvent[] = [];
  const handlers = new Map<string, Set<EventHandler>>();
  const wildcardHandlers = new Set<EventHandler>();
  const filterSubscriptions: Array<{ filter: EventFilter; handler: EventHandler }> = [];
  let persistPath: string | undefined;
  let seqId = 0;

  if (opts.persistDir) {
    persistPath = join(opts.persistDir, "events.jsonl");
    mkdir(dirname(persistPath), { recursive: true }).catch(() => {});
  }

  function matchesFilter(event: MabosEvent, filter: EventFilter): boolean {
    if (filter.types?.length && !filter.types.some((t) => event.type.startsWith(t))) {
      return false;
    }
    if (filter.sources?.length && !filter.sources.includes(event.source)) {
      return false;
    }
    if (filter.agentIds?.length && event.agentId && !filter.agentIds.includes(event.agentId)) {
      return false;
    }
    return true;
  }

  return {
    emit(partial) {
      const event: MabosEvent = {
        id: `evt-${++seqId}-${Date.now()}`,
        type: partial.type,
        source: partial.source,
        agentId: partial.agentId,
        payload: partial.payload,
        timestamp: new Date().toISOString(),
      };

      buffer.push(event);
      if (buffer.length > maxBuffer) {
        buffer.splice(0, buffer.length - maxBuffer);
      }

      // Type-specific handlers
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const h of typeHandlers) {
          try { h(event); } catch { /* don't crash on handler errors */ }
        }
      }

      // Wildcard handlers
      for (const h of wildcardHandlers) {
        try { h(event); } catch {}
      }

      // Filtered subscriptions
      for (const sub of filterSubscriptions) {
        if (matchesFilter(event, sub.filter)) {
          try { sub.handler(event); } catch {}
        }
      }

      // Persist (fire-and-forget)
      if (persistPath) {
        appendFile(persistPath, JSON.stringify(event) + "\n").catch(() => {});
      }
    },

    on(type, handler) {
      if (type === "*") {
        wildcardHandlers.add(handler);
        return () => { wildcardHandlers.delete(handler); };
      }
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
      return () => { set!.delete(handler); };
    },

    subscribe(filter, handler) {
      const entry = { filter, handler };
      filterSubscriptions.push(entry);
      return () => {
        const idx = filterSubscriptions.indexOf(entry);
        if (idx >= 0) filterSubscriptions.splice(idx, 1);
      };
    },

    getRecent(limit = 50) {
      return buffer.slice(-limit);
    },

    stop() {
      handlers.clear();
      wildcardHandlers.clear();
      filterSubscriptions.length = 0;
    },
  };
}
