# MABOS Enrichment + Assumptions API

Makes onboarding smarter: infer **smart defaults** for a partial `CompanyDNA`,
record each as a tracked **assumption** (confidence + rationale + status),
**continuously enrich** the business model as new info arrives, and produce
**predictive + prescriptive** output gated on **validated** assumptions.

All LLM calls go through the effort/capacity/cost model router
(`src/model-router`). Assumptions are speculative proposals; only **validated**
ones are promoted into the business fact store, so reasoning over facts never
sees guesses.

## Lifecycle

```
partial CompanyDNA
   │  (enrich: infer missing fields)
   ▼
assumptions (status=assumed, confidence, rationale)
   │  (validate: explicit OR Bayesian evidence)
   ▼
validated assumptions ──promote──▶ businesses/<id>/agents/knowledge/facts.json
   │
   ▼
predict + prescribe  (gated on validated)
```

## Auto-enrichment during provisioning

`POST /mabos/provision/instances` runs an `enrich` pipeline step between scaffold
and GDC by default — it fills missing `CompanyDNA` fields so the agents are
bootstrapped from a complete model. Set `"enrich": false` on the request to skip
it. Inferred assumptions are written to `businesses/<id>/assumptions.json`; the
enriched DNA is written back to `company_dna.json` and fed to GDC.

## Endpoints (`/mabos/enrichment`, gateway auth)

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| POST | `/:id/enrich` | `{ effort?, model?, fields?, new_info? }` | Infer missing fields (or merge `new_info`); returns assumptions + diffs + cost. |
| GET | `/:id/assumptions` | `?status=&field=` | List assumptions. |
| GET | `/:id/records` | — | Versioned enrichment history + diffs. |
| POST | `/:id/assumptions/:aid/validate` | `{ decision, evidence?, note? }` | Explicit validate/reject (validate promotes to facts). |
| POST | `/:id/assumptions/:aid/evidence` | `{ evidence: [{description, source, likelihood?, marginal?}] }` | Bayesian update; transitions across thresholds (≥0.75 validate, ≤0.25 reject). |
| POST | `/:id/predict` | `{ effort?, mode?, gate? }` | Predictions + prescriptions; `gate:"validated_only"` (default) uses only validated assumptions. `mode:"fast"` (default) is LLM-free. |
| GET | `/manifest` | — | Capabilities. |

The same operations are agent-callable tools: `enrich_business`,
`list_assumptions`, `validate_assumption`, `predict_prescribe` (at
`/mabos/tools/:name`).

## Assumption shape

```jsonc
{
  "id": "A-…", "business_id": "acme", "field": "mission",
  "value": "Make widgets delightful.",
  "confidence": 0.7, "rationale": "industry norm",
  "source": "llm_inference",            // | user | harness | bayesian | default_rule
  "status": "assumed",                  // | validated | rejected
  "evidence": [], "history": [],
  "enrichment_id": "ENR-…", "created_at": "…", "updated_at": "…"
}
```

## Predict/prescribe output

Each prediction and prescription is tagged `derived_from: "validated" |
"speculative"`. `gate:"validated_only"` excludes unvalidated assumptions
entirely; `gate:"all"` includes working assumptions but marks them speculative.
`mode:"llm"` adds reasoning-framed (deontic/abductive/meta) narratives and
actions via one model-router call; `mode:"fast"` returns the algorithmic Bayesian
summary with zero LLM calls.

## Persistence

- `businesses/<id>/assumptions.json` — `{assumptions[], records[], version}`, append-only.
- `businesses/<id>/company_dna.json` — rewritten with enriched values.
- `businesses/<id>/agents/knowledge/facts.json` — receives promoted validated assumptions.
