# MABOS Desktop App Implementation Plan

Date: 2026-04-30

## Purpose

The MABOS desktop app should turn the existing OpenClaw-based MABOS runtime into a unified local-first business operating system. It should not be a separate CRUD app beside the agent system. The desktop product must expose, operate, and govern the current MABOS architecture: BDI agents, cognitive files, goals, plans, tasks, actions, ontologies, workflows, business integrations, governance controls, execution sandboxes, and model routing.

The design intent is broader than planning screens. MABOS should become the development and operational layer for running and managing a business:

- Development layer: define business DNA, ontologies, workflows, agent roles, skills, tools, prompts, plans, tasks, and executable actions.
- Operational layer: run BDI cycles, coordinate agents, review decisions, execute approved work, synchronize external systems, track budgets, audit actions, and report progress.
- Governance layer: keep humans in control of material actions through permissions, approval gates, budget limits, audit logs, source provenance, and staged AI outputs.

## Current Repository Baseline

This is not a greenfield app. The current package already includes:

- An OpenClaw plugin runtime in `extensions/mabos/extensions-mabos/index.ts`.
- A React 19, Vite, Tailwind v4 dashboard under `extensions/mabos/extensions-mabos/ui`.
- Dashboard routes for overview, agents, projects, initiatives, tasks, decisions, goals, workflows, knowledge graph, commerce, accounting, marketing, operations, governance, legal, compliance, security, skills, and sessions.
- A file-backed workspace model with business manifests, agent cognitive files, decision queues, metrics, inboxes, cases, facts, and rules.
- Optional TypeDB synchronization for SBVR/ontology-backed knowledge.
- Existing SQLite usage for audit logging, budget/cost ledgers, and session FTS indexing.
- A 7-stage Goal Decomposition Chain that transforms business DNA into goals, refined goal trees, projects, plans, tasks, actions, and execution assemblies.
- Governance, security, model-router, session-intelligence, skill-loop, execution-sandbox, sync, and ERP-style route modules.

The desktop plan should extend this architecture. It should avoid replacing the existing Node/OpenClaw plugin runtime with an unrelated Rust CRUD service.

## Product Scope

Core desktop product surfaces:

- Landing/workspace selection page.
- New business onboarding based on the existing MABOS 5-phase onboarding pipeline.
- Existing business onboarding and import flow for business identity, credentials, SaaS stack, research notes, vision/mission, values, BMC, TOGAF, Tropos goals, and agent activation.
- Workspace dashboard for system status, business health, BDI heartbeat, decisions, activity, generation jobs, and recommendations.
- Goals, including Tropos goal model views, list/detail views, create/edit/delete flows, AI review, revision history, and goal-to-plan generation.
- Projects/initiatives/plans for strategy-to-execution decomposition.
- Tasks and actions for daily execution, dependencies, ownership, progress, and completion.
- Decisions and governance for approvals, budget thresholds, RBAC, policy checks, and audit review.
- Agents for cognitive state, persona files, goals, intentions, plans, memory, capabilities, and manual BDI cycles.
- Workflows and BPMN editor for operational processes.
- Knowledge graph and ontology tooling for SBVR/JSON-LD/TypeDB-backed business knowledge.
- Commerce, customers, marketing, accounting, inventory, suppliers, supply chain, legal, compliance, analytics, security, skills, and sessions surfaces already represented in the UI.
- Chat assistant for local workspace questions and confirmed safe actions.
- Settings for model providers, credentials, data location, backup/restore, privacy, telemetry, and updater preferences.

## Recommended Stack

Use Tauri 2 + the existing React/Vite UI + the existing OpenClaw/MABOS Node runtime + local workspace storage.

| Layer                     | Choice                                                          | Rationale                                                                                                                    |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell             | Tauri 2                                                         | Small cross-platform shell for menus, windows, secure storage, packaging, updater, filesystem permissions, and native UX.    |
| Agent runtime             | Existing OpenClaw plugin runtime                                | Preserves the current 99-tool MABOS architecture, gateway hooks, HTTP API, BDI cycles, and extension model.                  |
| UI                        | Existing React 19 + TypeScript + Vite app                       | Already maps to the dashboard and Figma-style productivity surfaces.                                                         |
| Styling                   | Tailwind CSS v4 + CSS variables                                 | Already present; continue expanding canonical tokens in `ui/src/styles/design-tokens.css`.                                   |
| Components                | Existing shadcn-style local components                          | Keeps dialogs, buttons, cards, tabs, and shell controls local and extensible.                                                |
| App state                 | TanStack Query plus small local UI stores as needed             | The UI already fetches from `/mabos/api`; use local stores only for transient UI state.                                      |
| Primary workspace storage | Existing JSON/Markdown workspace files                          | Cognitive files, manifests, cases, rules, BMC, TOGAF, Tropos, and agent state already live here.                             |
| Operational indexes       | SQLite with WAL and FTS5                                        | Use for audit logs, budget/cost ledgers, search indexes, generation-job indexes, session recall, and fast dashboard queries. |
| Knowledge graph           | JSON-LD/OWL plus optional TypeDB                                | Preserve SBVR-aligned ontology source files and best-effort TypeDB sync.                                                     |
| AI/model layer            | Existing model router plus provider-specific clients            | Keep Anthropic/OpenAI/Google/etc. routing, cost estimation, fallback chains, and prompt caching where available.             |
| Native bridge             | Thin Tauri commands around desktop-only privileges              | Use Rust for keychain, file dialogs, OS integration, updater, app lifecycle, and launching/monitoring the MABOS runtime.     |
| Packaging                 | Tauri bundler                                                   | Native installers for macOS, Windows, and Linux.                                                                             |
| Testing                   | Existing Vitest setup, UI tests, Playwright, Rust command tests | Extend current tests instead of introducing a separate validation stack.                                                     |

Electron remains a fallback only if MABOS needs Chromium-specific behavior or deep Node integration in the shell. Flutter remains a fallback only if the product shifts away from the web dashboard and toward a custom native-rendered UI. Wails remains a fallback only if the backend becomes Go-first.

## Architecture

MABOS Desktop should have four explicit boundaries:

1. Renderer: React routes, dashboards, forms, review UIs, chat, workflow editing, and local interaction state.
2. MABOS runtime: existing OpenClaw plugin process exposing `/mabos/api/*`, registering MABOS tools, running BDI heartbeat, coordinating agents, and serving workspace data.
3. Native desktop layer: Tauri commands for secure storage, filesystem import/export, backup/restore, updater, menus, windows, app lifecycle, and process supervision.
4. External systems: model providers and SaaS connectors reached only through approved runtime/native commands.

The renderer should not receive raw API keys, SaaS tokens, or filesystem-wide authority. The desktop shell should either launch and supervise the MABOS runtime locally or connect to an already running trusted local gateway. That runtime relationship must be decided and documented before broad implementation.

## Storage Model

Use a hybrid local-first model instead of a SQLite-only rewrite.

Source-of-truth records:

- Business workspace files: manifests, TOGAF, BMC, Tropos models, metrics, decision queues, and onboarding progress.
- Agent cognitive files: Persona, Beliefs, Desires, Goals, Intentions, Plans, Capabilities, Memory, Cases, Playbooks, inboxes, facts, and rules.
- Ontology files: JSON-LD/OWL domain ontologies and SHACL/SBVR shapes.
- Workflow files: BPMN process models and generated workflow state.

Indexed or transactional records:

- AuditEvent
- BudgetLedger and CostEvent
- GenerationJob
- SearchIndex and FTS-backed local recall
- ChatThread and ChatMessage indexes
- SyncRun and ConnectorState
- ImportExportManifest

SQLite should accelerate search, dashboards, governance, cost tracking, and migration bookkeeping. It should not silently become the only source of truth for cognitive files or ontologies unless a migration plan explicitly changes that.

## Domain Model Gaps To Close

The desktop data model must include more than business profile, goals, plans, tasks, and chat. It should cover:

- Agent, AgentRole, CognitiveFile, Belief, Desire, Intention, Capability, MemoryItem, Case, Fact, Rule.
- BusinessProfile, BusinessModelCanvas, TOGAFArchitecture, TroposGoalModel, VisionMission, CoreValue, ResearchArtifact.
- Goal, Project, Initiative, Plan, Task, Action, Workflow, WorkflowRun.
- Decision, ApprovalRequest, PolicyCheck, AuditEvent, BudgetAllocation, CostEvent.
- Connector, CredentialSource, SyncRun, WebhookEvent, ExternalRecordMapping.
- GenerationJob, PromptVersion, SchemaVersion, StagedRecord, ReviewDecision.
- ChatThread, ChatMessage, Citation, ToolCall, Confirmation.

## AI And Generation Contract

AI generation must be provider-agnostic at the product architecture level. OpenAI Structured Outputs can be one implementation path, but the app already has Anthropic usage and a model router with multiple providers. The contract should be:

- All operational generation returns typed, schema-validated records.
- Provider clients are accessed through the MABOS runtime or native command layer, never from renderer code.
- Outputs are staged before becoming operational records.
- Staged records include rationale, confidence, assumptions, source inputs, provenance, prompt version, schema version, model/provider, cost estimate, and review state.
- Material writes require explicit user confirmation or an approved governance policy.
- Refusals, invalid outputs, validation failures, and partial generation failures are preserved as recoverable job states.

Structured generation should cover:

- Business DNA extraction.
- BMC, TOGAF, Tropos, vision, mission, and values.
- Goal generation and refinement.
- Project/initiative scoping.
- Plan generation.
- Task decomposition.
- Action mapping.
- Execution DAG assembly.
- Research summaries.
- Chat assistant tool calls.

The existing Goal Decomposition Chain should be the first implementation target for strategy-to-execution generation instead of building a parallel goal/plan/task pipeline.

## Phased Plan

### Phase 0: Desktop Architecture Alignment

Outcome: the repo has a clear desktop path that preserves the MABOS runtime.

Tasks:

- Decide whether Tauri launches a bundled local MABOS runtime or connects to an existing local OpenClaw gateway.
- Document process lifecycle, ports, auth boundary, failure recovery, and development commands.
- Keep `/mabos/dashboard` and `/mabos/api` compatibility for the current UI.
- Add a desktop-specific build target without breaking the extension build.
- Expand design tokens and document the Figma-to-code token mapping.
- Inventory existing pages/components against the Figma surfaces and mark reuse, adapt, or build-new.

Validation gate:

- Current extension UI build still passes.
- Current dashboard still works at `/mabos/dashboard`.
- Desktop shell can show the existing dashboard route without remote services.

### Phase 1: Local Workspace And Runtime Supervision

Outcome: the desktop app can create, load, index, and supervise local MABOS workspaces.

Tasks:

- Add desktop runtime supervision for the MABOS plugin process or trusted local gateway.
- Add workspace selection, workspace health checks, and clear error recovery.
- Add a migration/indexer layer that reads existing workspace files and populates SQLite indexes.
- Add FTS5 indexes for cognitive files, goals, plans, tasks, actions, decisions, chat, sessions, and research artifacts.
- Add generation-job and audit indexes without moving cognitive source-of-truth records prematurely.

Validation gate:

- Existing business workspaces load without destructive migration.
- Search returns records from workspace files and SQLite-backed indexes.
- Restart preserves workspace selection and indexed data.

### Phase 2: Onboarding Consolidation

Outcome: new and existing business onboarding use the existing 5-phase MABOS pipeline while supporting richer desktop review screens.

Tasks:

- Reconcile Figma onboarding steps with the existing MABOS phases: discovery, architecture, agents, knowledge graph, launch.
- Persist onboarding progress in the workspace and index it for desktop resume.
- Add review screens for BMC, TOGAF, Tropos, generated agents, desires, and launch checklist.
- Support existing-business import by letting users provide research notes, credentials metadata, SaaS stack, mission/vision/values, and current operating artifacts.
- Keep credentials as secure references, not plaintext records.

Validation gate:

- User can complete onboarding without TypeDB or SaaS connections.
- Partial onboarding resumes after restart.
- Launch creates or updates workspace files, agent cognitive files, and reviewable generated artifacts.

### Phase 3: Generation Pipeline Hardening

Outcome: strategy-to-execution generation is schema-valid, staged, reviewable, and auditable.

Tasks:

- Use the existing Goal Decomposition Chain as the main generation pipeline.
- Add or formalize schemas for each generation stage.
- Persist `GenerationJob` records with status, input hash, prompt version, schema version, provider/model, cost, staged output, and review state.
- Add deterministic fixtures for each stage.
- Add retry, cancellation, refusal, invalid-output, and partial-success handling.
- Connect accepted outputs to the existing workspace files and audit log.

Validation gate:

- Each GDC stage validates before downstream use.
- Invalid/refused outputs do not mutate operational records.
- Accepted records are written to workspace files and audit indexed.

### Phase 4: Operational Dashboard

Outcome: the dashboard shows the business as an operating system, not just static records.

Tasks:

- Adapt the current overview to show BDI heartbeat, agent health, pending decisions, active goals, plans in progress, overdue tasks, actions due today, sync status, budget/cost status, security findings, and generation jobs.
- Add activity from audit logs and workspace events.
- Add local search entry points into cognitive files, ontology, workflows, and sessions.
- Make dashboard routes render offline from local workspace/index data.

Validation gate:

- Dashboard reflects workspace file changes and indexed operational events.
- No dashboard route requires remote network access to render a useful state.

### Phase 5: Goals, Projects, Plans, Tasks, And Actions

Outcome: users can move from business strategy to operational execution.

Tasks:

- Preserve Tropos goal model support and add list/detail workflows where Figma requires them.
- Connect goals to projects/initiatives, plans, tasks, and atomic actions.
- Add status workflows, owners, dependencies, due dates, priorities, confidence, source, and review state.
- Add bulk review for generated records.
- Ensure progress rolls up from actions to tasks to plans/projects to goals.

Validation gate:

- Manual and AI-generated execution records share compatible models.
- AI-decomposed records are staged before acceptance.
- Progress rollups match source records.

### Phase 6: Governance, Security, And Business Operations

Outcome: the app can safely operate a business with human-controlled autonomy.

Tasks:

- Surface decision queues, approval requests, RBAC, budget limits, cost events, policy checks, and audit events.
- Add secure credential storage and connector-state management for SaaS tools.
- Integrate execution sandbox status and approvals for local, Docker, SSH, and Modal backends where enabled.
- Add sync status for Shopify, Stripe, SendGrid, Google Analytics, TypeDB reverse sync, and future connectors.
- Add security views for injection scanning, tool guard findings, and SSRF/domain policy.

Validation gate:

- Mutating business operations require confirmation or policy approval.
- Cost and audit events are queryable.
- Credentials are not exposed in renderer logs, workspace files, or SQLite plaintext.

### Phase 7: Chat Assistant And Local Retrieval

Outcome: users can ask MABOS questions and trigger safe local actions.

Tasks:

- Persist chat threads scoped to workspace and agent/page context.
- Retrieve context from SQLite FTS, cognitive files, ontology records, workflows, audit events, and session intelligence.
- Add citations to local records used in answers.
- Add safe tool schemas for draft creation, summarization, search, progress explanation, and confirmed writes.
- Keep streaming internal to the UI; external messaging surfaces should receive final replies only.

Validation gate:

- Chat cites local workspace records.
- Tool calls are schema-constrained and require confirmation for writes.
- Chat history survives restart.

### Phase 8: Desktop-Native Features

Outcome: MABOS feels like a native desktop product.

Tasks:

- Add native menus, keyboard shortcuts, secure credential storage, import/export, backup/restore, updater strategy, settings, and optional drag-and-drop imports.
- Add workspace backup format covering files, SQLite indexes that need preservation, secure-store references, and restore validation.
- Add app lifecycle controls for starting, stopping, and diagnosing the local runtime.

Validation gate:

- App exports and restores a complete workspace backup.
- App packages for at least macOS and Windows.
- Runtime diagnostics explain startup and port failures clearly.

### Phase 9: Quality, Security, And Release

Outcome: MABOS is ready for private beta.

Tasks:

- Threat model Tauri commands, runtime HTTP routes, connector calls, and execution backends.
- Minimize Tauri capabilities by window and command.
- Add opt-in error reporting.
- Add performance budgets: cold launch under 2 seconds to visible shell, local route transition under 150 ms, generation progress visible within 500 ms after job start.
- Add Playwright coverage for all primary desktop routes.
- Add migration/index recovery tests.
- Add signed builds and release checklist.

Validation gate:

- Private beta build is signed, installable, and smoke-tested.
- Core routes have automated coverage.
- Existing workspaces can be opened, indexed, backed up, and restored.

## Milestone Map

| Milestone | Scope                                                               | Target                        |
| --------- | ------------------------------------------------------------------- | ----------------------------- |
| M0        | Runtime decision, desktop shell, token mapping, route compatibility | Developer alpha               |
| M1        | Workspace loading, runtime supervision, local indexes/search        | Local-first foundation        |
| M2        | Onboarding consolidation and staged generation                      | First usable product loop     |
| M3        | Operational dashboard and governance visibility                     | Business status usable        |
| M4        | Goals/projects/plans/tasks/actions                                  | Execution hierarchy usable    |
| M5        | Connectors, sandbox, audit, budget, security operations             | Managed business operations   |
| M6        | Chat assistant with local retrieval and safe actions                | AI operating assistant usable |
| M7        | Packaging, backup/restore, updater, release hardening               | Private beta                  |

## Key Risks

| Risk                                                            | Impact                                                | Mitigation                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Desktop plan bypasses existing MABOS runtime                    | Fragmented product and duplicated logic               | Treat the OpenClaw plugin runtime as the operating core and Tauri as shell/native services.                              |
| SQLite replaces cognitive files without migration design        | Loss of agent transparency and ontology compatibility | Keep workspace files as source of truth until an explicit migration is designed and tested.                              |
| AI pipeline forks from existing GDC                             | Inconsistent goals, plans, tasks, and actions         | Use GDC as the canonical strategy-to-execution pipeline.                                                                 |
| Provider-specific AI assumptions leak into product architecture | Vendor lock-in and broken model-router behavior       | Define provider-agnostic generation contracts and adapt provider-specific structured output features behind the runtime. |
| Credentials are mishandled                                      | High security risk                                    | Store secrets only in OS secure storage or existing approved credential mechanisms; SQLite stores metadata only.         |
| Governance is treated as a later polish item                    | Unsafe autonomous business operations                 | Bring approvals, RBAC, budget, policy, and audit into the operational milestone.                                         |
| Tauri permissions become too broad                              | Security exposure                                     | Define minimal capability files per window and command.                                                                  |
| Existing route/API compatibility breaks                         | Current dashboard and plugin workflows regress        | Keep `/mabos/dashboard` and `/mabos/api` stable until replacement routes are tested.                                     |
| Desktop packaging surprises                                     | Release delay                                         | Add Tauri smoke builds and runtime startup checks early.                                                                 |

## Source Links

- Tauri 2 overview: https://tauri.app/
- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri capabilities/security model: https://v2.tauri.app/security/capabilities/
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Flutter desktop support: https://docs.flutter.dev/platform-integration/desktop
- Wails introduction: https://wails.io/docs/next/introduction
- SQLite FTS5: https://www.sqlite.org/fts5.html
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
