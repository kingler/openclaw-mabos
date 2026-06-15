/**
 * Tool catalog — turns the registered MABOS tools into a JSON-serializable
 * catalog the API can advertise. Every MAS capability (Agents/BDI, Reasoning,
 * Knowledge, Memory, Learning/CBR, …) is a registered tool, so exposing the
 * catalog + an invoker exposes the whole operating surface in one place.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { categorize } from "../tools/capabilities-sync.js";

export interface CatalogEntry {
  name: string;
  label?: string;
  description: string;
  category: string;
}

export interface CatalogEntryDetail extends CatalogEntry {
  /** TypeBox/JSON schema for the tool's params (input contract). */
  parameters: unknown;
}

function toEntry(tool: AnyAgentTool): CatalogEntry {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description ?? "",
    category: categorize(tool.name),
  };
}

export function toDetail(tool: AnyAgentTool): CatalogEntryDetail {
  return { ...toEntry(tool), parameters: tool.parameters };
}

/**
 * Build the catalog, optionally filtered by `category` (exact, case-insensitive)
 * and/or `q` (substring match over name + description).
 */
export function buildCatalog(
  tools: AnyAgentTool[],
  opts: { category?: string; q?: string } = {},
): CatalogEntry[] {
  const category = opts.category?.toLowerCase();
  const q = opts.q?.toLowerCase();
  return tools
    .map(toEntry)
    .filter((e) => {
      if (category && e.category.toLowerCase() !== category) return false;
      if (q && !`${e.name} ${e.description}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
