# Project Structure - OpenClaw-MABOS

**Generated**: 2026-05-22
**Files (excluding node_modules / .git / dist / .next / .worktrees)**: 19,154

## Top-level

```text
openclaw-mabos/
├── apps/                      Mobile (iOS, Android) + macOS native apps
├── assets/                    Brand + screenshot assets
├── docs/                      Mintlify-hosted documentation (docs.openclaw.ai)
│   └── plans/                 Architecture + implementation plans
├── extensions/                Plugin extensions (workspace packages)
│   └── mabos/extensions-mabos/  (The MABOS plugin — this analysis focus)
├── mabos/                     Legacy MABOS surface (predates extension move)
├── packages/                  Workspace packages (foundation libs)
├── scripts/                   Repo automation scripts (123 entries)
├── skills/                    Claude Code skills
├── src/                       OpenClaw core (CLI, channels, gateway, infra)
├── test/                      Top-level test fixtures
├── ui/                        OpenClaw core UI (not the MABOS dashboard)
├── vendor/                    Vendored dependencies
├── AGENTS.md to CLAUDE.md     Repo guidelines (symlinked)
├── README.md, VISION.md, MABOS-DESCRIPTION.md, MULTI_AGENT_SYSTEM.md
├── SECURITY.md, CONTRIBUTING.md
├── Dockerfile + Dockerfile.sandbox/.sandbox-browser/.sandbox-common
├── docker-compose.yml, setup-podman.sh, docker-setup.sh
├── pnpm-workspace.yaml, pnpm-lock.yaml, package.json
└── vitest.{,channels,e2e,extensions,gateway,live,scoped,unit}.config.ts
```

## extensions/mabos/extensions-mabos/ (the MABOS plugin)

```text
extensions-mabos/
├── docs/
│   ├── DESKTOP-APP-IMPLEMENTATION-PLAN.md
│   ├── UX-SETUP-WIZARD-SPEC.md
│   └── vividwalls/           Tenant brand guidelines + design tokens
├── scripts/
│   ├── director-orchestrator.ts
│   └── run-heartbeat.ts
├── skills/                   Claude Code skills bundled with the plugin
├── src/
│   ├── cron-bridge.ts        Cron heartbeat bridge with stale-parent recovery
│   ├── dashboard/index.html  Static dashboard shell
│   ├── execution-sandbox/    Phase 1-3 module (manager, backends, hooks, routes)
│   ├── gdc/                  Goal-directed cognition (writer, persona, prompts)
│   ├── governance/           Phase 1-3 module (budget, RBAC, audit, tools)
│   ├── knowledge/            TypeDB schemas + queries
│   ├── model-router/         Phase 1-3 module (resolver, MoA, cache, cost)
│   ├── onboarding/           AI suggestions for tenant onboarding
│   ├── ontology/             JSON-LD ontology corpus (10 files)
│   ├── reasoning/            causal/probabilistic/social/meta/formal/fusion engines
│   ├── security/             Phase 1-3 module (scanner, SSRF, tool guard, hooks)
│   ├── session-intel/        Phase 1-3 module (FTS5 index, recall, user model)
│   ├── skill-loop/           Phase 1-3 module (registry, creator, nudge, marketplace)
│   ├── sync/                 Provider sync runners (Shopify, Stripe, SendGrid, GA)
│   ├── tools/                BDI cognitive tools (76 TS files — large surface)
│   ├── types/
│   └── (Phase 5+ missing: mission-control/, orchestrator/)
├── templates/
│   └── base/agents/cli-engineer/  CLI Agent BDI template (2026-05-22)
├── tests/                    56 test files; 410 assertions; 377 passing
├── ui/                       React 19 + Vite + TanStack Router SPA
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── contexts/         BusinessContext + auth context
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/            29 dashboard pages (Overview, Accounting, ...)
│   │   ├── router.tsx        TanStack Router config
│   │   ├── styles/
│   │   └── main.tsx
│   └── (vite + tsconfig + index.html in ui/)
├── workspace/                Tenant workspace state (per-instance)
├── index.ts                  Plugin entry
├── openclaw.plugin.json      OpenClaw plugin manifest
├── MODEL-HIERARCHY.md
└── package.json              @openclaw/mabos v2026.2.17
```

## packages/ (workspace foundation libs)

```text
packages/
├── shared/             @mabos/shared          (zod types + constants)
├── db/                 @mabos/db              (better-sqlite3 client)
├── gateway-client/     @mabos/gateway-client  (REST + SSE clients)
├── ui-kit/             @mabos/ui-kit          (StatusBadge, MetricCard, SectionHeader)
├── clawdbot/           Legacy ClawdBot helper
└── moltbot/            Legacy Moltbot helper
```

## docs/plans/ (architecture + implementation)

```text
docs/plans/
├── 2026-03-25-email-tool.md
├── 2026-03-28-direct-api-sync.md
├── 2026-03-28-fact-store-integrity.md
├── 2026-03-29-unified-mabos-design.md          (source of truth for unified design)
├── 2026-03-29-unified-mabos-implementation.md  (phased plan: Phase 1-8)
├── 2026-04-05-email-cron-customer-service.md
├── 2026-04-05-enhanced-onboarding-with-gdc.md
├── 2026-04-05-real-data-mapping.md
├── 2026-04-06-connected-goal-campaign-task-hierarchy.md
├── 2026-05-22-cli-agent-design.md              (latest design: CLI Agent)
└── 2026-05-22-cli-agent-implementation.md      (latest impl plan: CLI Agent)
```

## .context/ (cross-conversation status; this file lives here)

```text
.context/
├── README.md
├── overall_project_status.md      master status (this run)
├── feature_checklist.md           module completion + Linear mapping
├── identified_issues.md           bugs / smells / sync gaps
├── recommendations.md             prioritized next steps
├── deployment_readiness.md        go/no-go checklist
└── project_structure.md           this file
```

## Module to Linear quick reference

| Module path                                 | Linear             |
| ------------------------------------------- | ------------------ |
| src/security/                               | ONEK-406           |
| src/governance/                             | ONEK-407           |
| src/model-router/                           | ONEK-408           |
| src/session-intel/                          | ONEK-409           |
| src/execution-sandbox/                      | ONEK-410           |
| src/skill-loop/                             | ONEK-411           |
| ui/src/pages/ (29 dashboard pages)          | ONEK-412           |
| packages/{shared,db,gateway-client,ui-kit}/ | ONEK-413           |
| (future) src/mission-control/               | ONEK-414..417      |
| (future) src/orchestrator/ + Hermes adapter | ONEK-422..426      |
| Unified console SPA polish                  | ONEK-418..421      |
| Release polish + e2e + migration + docs     | ONEK-427..430      |
| Test infra blockers                         | ONEK-431, 432, 433 |
