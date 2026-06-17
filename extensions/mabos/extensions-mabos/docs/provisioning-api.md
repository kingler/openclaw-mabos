# MABOS Provisioning Control Plane

The provisioning module exposes a small REST API that lets a **meta harness**
create and deploy MABOS instances end to end. An "instance" is a single
business: a `businesses/<id>/` workspace with a manifest, a roster of BDI
agents, a generated goal/plan/task graph, and a deployment target.

The API composes existing primitives — the onboarding scaffold, the Goal
Decomposition Chain (GDC), and the deployment renderers — behind one
idempotent, async, pollable contract. It is registered as Module 8b in the
MABOS extension (`src/provisioning/`).

## Pipeline

A create request runs an async job with four steps; the harness polls the job:

```
scaffold → gdc_bootstrap → cron_seed → deploy
```

| Step           | What it does                                                              | Source                     |
| -------------- | ------------------------------------------------------------------------- | -------------------------- |
| scaffold       | Writes `manifest.json`, agent skeletons, `company_dna.json`, integrations | `src/provisioning/scaffold.ts` |
| gdc_bootstrap  | Runs GDC → goals/plans/tasks/domain-agents → BDI cognitive files          | `src/provisioning/cognitive.ts` |
| cron_seed      | Seeds `cron-jobs.json` so `CronBridge` can sync the instance              | `src/provisioning/pipeline.ts` |
| deploy         | Applies the deploy target (in-gateway / container / cloud)                | `src/provisioning/deploy.ts` |

## Authentication

All routes use `auth: "gateway"` — send the gateway bearer token:

```
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
```

## Endpoints

| Method   | Path                                    | Purpose                          |
| -------- | --------------------------------------- | -------------------------------- |
| `POST`   | `/mabos/provision/instances`            | Create an instance (202 + jobId) |
| `GET`    | `/mabos/provision/instances`            | List instances + status          |
| `GET`    | `/mabos/provision/instances/:id`        | Instance detail                  |
| `DELETE` | `/mabos/provision/instances/:id`        | Decommission (archives workspace)|
| `POST`   | `/mabos/provision/instances/:id/deploy` | (Re)deploy / change target       |
| `GET`    | `/mabos/provision/jobs/:id`             | Poll provisioning job status     |
| `GET`    | `/mabos/provision/manifest`             | Capabilities (templates, roles)  |

### Create

`POST /mabos/provision/instances`

```jsonc
{
  "business_id": "acme",            // idempotency key; 409 if it exists
  "name": "Acme Inc",
  "legal_name": "Acme Incorporated",
  "template": "ecommerce",          // base | ecommerce | saas | consulting
  "company_dna": {                  // see src/gdc/types.ts CompanyDNA
    "business_description": "Acme sells widgets globally.",
    "mission": "Widgets for all",
    "vision": "A widget on every desk",
    "industry": "ecommerce",
    "stage": "growth",
    "revenue": "$1M ARR",
    "team_size": 12,
    "key_products": ["Widget Pro"],
    "channels": ["web"],
    "constraints": []
  },
  "tool_inventory": [],
  "integrations": { "stripe": { "api_key": "sk_live_…" } },
  "max_stage": 7,
  "effort": "medium",            // low | medium | high — selects the model pool
  "model": "claude-sonnet-4-6",  // optional explicit override (bypasses effort)
  "deploy": { "target": "in-gateway", "channels": ["slack"], "activate": true }
}
```

Response `202 Accepted`:

```json
{
  "instance_id": "acme",
  "job_id": "job-abcdef123456",
  "status": "queued",
  "poll": "/mabos/provision/jobs/job-abcdef123456"
}
```

### Poll the job

`GET /mabos/provision/jobs/:id` returns the job with per-step status. On
success the `result` carries the deploy outcome, agent roster, goal count,
the `effort` used, and the cumulative GDC token `cost_usd`.

### LLM provider selection (effort, capacity, cost)

The GDC bootstrap's LLM calls go through the swappable model router
(`src/model-router`). The provider/model is **not** hardcoded — it is chosen per
call from:

- **Effort** (`effort: low | medium | high`) — picks a candidate model pool
  (configurable via `modelRouter.effortPolicy`). Defaults: low → Haiku / GPT-4.1-mini /
  Gemini Flash; medium → Sonnet / GPT-4.1 / Gemini Pro; high → Opus / o3 / Gemini Pro.
- **Capacity** — only providers whose API key is set are considered; a provider
  that returns 429/5xx is put on a cooldown and the next call fails over to the
  next-cheapest available provider automatically.
- **Token cost** — among the eligible models the **cheapest** (blended
  input+output price) is selected, subject to an optional
  `modelRouter.costBudget.maxUsdPer1kBlended` cap.

Set `model` on the request to pin an explicit model and bypass effort selection.
Configure providers/keys/base URLs and the effort policy under the `modelRouter`
plugin config (`providers`, `effortPolicy`, `costBudget`, `capacityCooldownMs`).

## Deploy targets

Set `deploy.target`:

| Target       | Behavior                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| `in-gateway` | Multi-tenant: the business runs in this gateway. Marks the manifest active.           |
| `container`  | Renders a per-instance `docker-compose.yml` + gateway token under `deploy/`.          |
| `cloud`      | Renders `fly.toml` (provider `fly`) or `render.yaml` (provider `render`) under `deploy/`. |

Cloud and container targets produce **artifacts and an `apply_command`** rather
than shelling out — the gateway process typically lacks Fly/Docker credentials.
The harness or an operator runs the returned command. For example, the Fly
outcome returns:

```json
{
  "target": "cloud",
  "artifacts": ["fly.toml"],
  "gateway_token": "mabos-…",
  "apply_command": "fly launch --copy-config --no-deploy -c businesses/acme/deploy/fly.toml && fly secrets set OPENCLAW_GATEWAY_TOKEN=… -a mabos-acme && fly deploy -c businesses/acme/deploy/fly.toml",
  "base_url": "https://mabos-acme.fly.dev"
}
```

A typical harness flow for an isolated instance: call `cloud` deploy → run the
`apply_command` → point a second control-plane client at `base_url` with the
returned `gateway_token`.

## Records

Instances and jobs persist as JSON under `<workspace>/provisioning/`
(`instances/<id>.json`, `jobs/<id>.json`) so they survive restarts and are
visible to the dashboard. Decommission archives `businesses/<id>/` to
`provisioning/archive/` rather than hard-deleting.
