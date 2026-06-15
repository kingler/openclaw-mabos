# MABOS Tool API

The Tool API exposes the **full MABOS operating surface** over REST so a meta
harness can drive a running instance directly — not only through the LLM agent.

Every MAS capability in MABOS is implemented as a registered tool: Agents/BDI,
Reasoning (10 methods + fusion), Knowledge (fact store, rules, inference,
ontology), Memory (episodic/semantic, hierarchy), and Learning (case-based
reasoning), plus Coordination, Business Ops, Finance, Marketing, E-commerce,
and integrations. Because they are all tools, one catalog + one invoker expose
them all.

## Authentication

All routes use `auth: "gateway"` — send the gateway bearer token:

```
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
```

The invoker can reach any registered tool (including state-changing ones), so
the bearer token is the security boundary.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/mabos/tools` | Catalog of all tools (filter with `?category=` / `?q=`) |
| `GET` | `/mabos/tools/:name` | One tool with its parameter JSON schema |
| `POST` | `/mabos/tools/:name` | Invoke the tool |
| `GET` | `/mabos/api/index` | Unified index of the whole MABOS API surface |

### Catalog

`GET /mabos/tools`

```json
{
  "count": 110,
  "tools": [
    { "name": "bdi_get_beliefs", "label": "Get Beliefs", "description": "…", "category": "BDI Core" },
    { "name": "reasoning_deductive", "label": "Deductive Reasoning", "description": "…", "category": "Reasoning" }
  ]
}
```

Filter examples: `GET /mabos/tools?category=Reasoning`, `GET /mabos/tools?q=memory`.

### Tool detail

`GET /mabos/tools/:name` returns the entry plus `parameters` — the TypeBox/JSON
schema for the request body, so a harness can construct valid calls or generate
clients.

### Invoke

`POST /mabos/tools/:name` — the request body **is** the tool's params object.
Params are validated against the tool's schema before execution; a `400` with
`details` is returned on a mismatch.

```jsonc
// POST /mabos/tools/bdi_get_beliefs
{ "business_id": "acme", "agent_id": "ceo" }
```

```json
{
  "ok": true,
  "tool": "bdi_get_beliefs",
  "content": [{ "type": "text", "text": "…" }],
  "details": { "...": "tool-specific structured result" }
}
```

Tool errors are returned as `500` with `{ "ok": false, "error": "…" }`.

## Scoping

Most MABOS tools take `business_id` (and where relevant `agent_id`) in their
params and resolve workspace state per business, so the harness scopes a call
by including those fields in the body. Inspect `GET /mabos/tools/:name` to see
which fields a given tool requires.

## Unified index

`GET /mabos/api/index` returns a single map of the MABOS API: the Tool API, the
provisioning control plane (`/mabos/provision/*`), the capabilities endpoint,
and the operational route families (agents, BDI, coordination, decisions,
knowledge, GDC, workflows, governance, sessions, models, businesses). Use it as
the entry point to discover everything else.

## Relationship to the provisioning API

- **Provisioning** (`/mabos/provision/*`) creates and deploys an instance.
- **Tool API** (`/mabos/tools`) operates a running instance.

A typical harness flow: provision an instance → poll the job to `succeeded` →
drive the instance via `/mabos/tools` (set goals, run reasoning, query
knowledge, recall memory, trigger BDI cycles, etc.).
