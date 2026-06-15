/**
 * REST surface for enrichment + assumptions, mounted at /mabos/enrichment.
 * Conventions mirror src/provisioning/routes.ts: a single prefix route with
 * gateway auth that dispatches by method + path suffix.
 */

import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Value } from "@sinclair/typebox/value";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { CompanyDNA } from "../gdc/types.js";
import type { LlmCallFactory } from "../provisioning/types.js";
import { predictAndPrescribe } from "./predictor.js";
import { enrichBusiness } from "./service.js";
import { AssumptionStore } from "./store.js";
import type { AssumptionEvidence } from "./types.js";
import {
  EnrichBodySchema,
  EvidenceBodySchema,
  PredictBodySchema,
  ValidateBodySchema,
} from "./types.js";
import { validateByEvidence, validateExplicit } from "./validator.js";

const PREFIX = "/mabos/enrichment";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    total += buf.length;
    if (total > 1024 * 1024) throw new Error("Request body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function sanitizeId(id: string): string | null {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : null;
}

async function loadCompanyDna(
  workspaceDir: string,
  businessId: string,
): Promise<CompanyDNA | null> {
  try {
    const raw = await readFile(
      join(workspaceDir, "businesses", businessId, "company_dna.json"),
      "utf-8",
    );
    return JSON.parse(raw) as CompanyDNA;
  } catch {
    return null;
  }
}

const MANIFEST = {
  api_version: "1",
  effort_levels: ["low", "medium", "high"],
  assumption_statuses: ["assumed", "validated", "rejected"],
  predict_modes: ["fast", "llm"],
  predict_gates: ["validated_only", "all"],
  endpoints: [
    "POST /mabos/enrichment/:id/enrich",
    "GET /mabos/enrichment/:id/assumptions",
    "GET /mabos/enrichment/:id/records",
    "POST /mabos/enrichment/:id/assumptions/:aid/validate",
    "POST /mabos/enrichment/:id/assumptions/:aid/evidence",
    "POST /mabos/enrichment/:id/predict",
    "GET /mabos/enrichment/manifest",
  ],
};

export interface EnrichmentRoutesDeps {
  workspaceDir: string;
  makeCallLlm: LlmCallFactory;
  logger: { info: (m: string) => void; error: (m: string) => void };
}

export function registerEnrichmentRoutes(api: OpenClawPluginApi, deps: EnrichmentRoutesDeps): void {
  const store = new AssumptionStore(deps.workspaceDir);

  api.registerHttpRoute({
    path: PREFIX,
    match: "prefix",
    auth: "gateway",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const method = (req.method || "GET").toUpperCase();
      const rest = url.pathname.slice(PREFIX.length).replace(/\/$/, "");

      try {
        if (method === "GET" && rest === "/manifest") return sendJson(res, 200, MANIFEST);

        const idMatch = rest.match(/^\/([^/]+)(\/.*)?$/);
        if (!idMatch) return sendJson(res, 404, { error: "Not found" });
        const businessId = sanitizeId(decodeURIComponent(idMatch[1]));
        if (!businessId) return sendJson(res, 400, { error: "Invalid business id" });
        const sub = idMatch[2] ?? "";

        // POST /:id/enrich
        if (method === "POST" && sub === "/enrich") {
          const dna = await loadCompanyDna(deps.workspaceDir, businessId);
          if (!dna) return sendJson(res, 404, { error: "Business not found" });
          const body = await readBody(req);
          if (!Value.Check(EnrichBodySchema, body)) {
            return sendJson(res, 400, { error: "Invalid body" });
          }
          const out = await enrichBusiness({
            workspaceDir: deps.workspaceDir,
            store,
            makeCallLlm: deps.makeCallLlm,
            businessId,
            companyDNA: dna,
            trigger: body.new_info ? "new_info" : "manual",
            effort: body.effort,
            model: body.model,
            fields: body.fields,
            newInfo: body.new_info as Partial<CompanyDNA> | undefined,
          });
          return sendJson(res, 200, {
            enrichment_id: out.record.id,
            inferred_fields: out.record.inferred_fields,
            diffs: out.record.diffs,
            assumptions: out.assumptions,
            cost_usd: out.record.cost_usd,
          });
        }

        // GET /:id/assumptions
        if (method === "GET" && sub === "/assumptions") {
          const status = url.searchParams.get("status") as never;
          const field = url.searchParams.get("field") ?? undefined;
          return sendJson(
            res,
            200,
            await store.listByStatus(businessId, status || undefined, field),
          );
        }

        // GET /:id/records
        if (method === "GET" && sub === "/records") {
          return sendJson(res, 200, { records: await store.records(businessId) });
        }

        // POST /:id/predict
        if (method === "POST" && sub === "/predict") {
          const body = await readBody(req);
          if (!Value.Check(PredictBodySchema, body)) {
            return sendJson(res, 400, { error: "Invalid body" });
          }
          const mode = body.mode ?? "fast";
          const result = await predictAndPrescribe({
            store,
            businessId,
            mode,
            gate: body.gate ?? "validated_only",
            callLlm:
              mode === "llm" ? deps.makeCallLlm({ effort: body.effort ?? "medium" }) : undefined,
          });
          return sendJson(res, 200, result);
        }

        // POST /:id/assumptions/:aid/validate  and  /evidence
        const aMatch = sub.match(/^\/assumptions\/([^/]+)\/(validate|evidence)$/);
        if (method === "POST" && aMatch) {
          const aid = sanitizeId(decodeURIComponent(aMatch[1]));
          if (!aid) return sendJson(res, 400, { error: "Invalid assumption id" });
          const body = await readBody(req);

          if (aMatch[2] === "validate") {
            if (!Value.Check(ValidateBodySchema, body)) {
              return sendJson(res, 400, { error: "Invalid body" });
            }
            const a = await validateExplicit(
              store,
              deps.workspaceDir,
              businessId,
              aid,
              body.decision,
              normalizeEvidence(body.evidence),
              body.note,
            );
            return sendJson(res, 200, { assumption: a });
          }

          if (!Value.Check(EvidenceBodySchema, body)) {
            return sendJson(res, 400, { error: "Invalid body" });
          }
          const out = await validateByEvidence(
            store,
            deps.workspaceDir,
            businessId,
            aid,
            normalizeEvidence(body.evidence) ?? [],
          );
          return sendJson(res, 200, out);
        }

        return sendJson(res, 404, { error: "Not found" });
      } catch (err) {
        deps.logger.error(`[mabos] enrichment route error: ${String(err)}`);
        return sendJson(res, 500, { error: String(err) });
      }
    },
  });

  deps.logger.info("[mabos] enrichment control-plane registered (/mabos/enrichment/*)");
}

/** Default observed_at on evidence items that omit it. */
function normalizeEvidence(
  items?: Array<Partial<AssumptionEvidence> & { description: string; source: string }>,
): AssumptionEvidence[] | undefined {
  if (!items) return undefined;
  const now = new Date().toISOString();
  return items.map((e) => ({
    description: e.description,
    source: e.source,
    likelihood: e.likelihood,
    marginal: e.marginal,
    fact_id: e.fact_id,
    observed_at: e.observed_at ?? now,
  }));
}
