# MABOS Desktop App Implementation Plan

Date: 2026-04-30

## Product Scope

The MABOS desktop app should become a local-first AI business operating system. It should preserve the existing MABOS React dashboard surfaces while adding native desktop packaging, secure local data, and a strict review boundary for AI-generated operational records.

Core product surfaces:

- Landing page with product positioning and conversion CTA.
- New business onboarding with welcome, business context, team/resources, AI generation, and review/launch steps.
- Existing business onboarding with business identity, credentials, description, SaaS stack, research summary, vision/mission, values, BMC auto-population, and completion.
- Workspace dashboard for the high-level operating view.
- Goals, including list, create dialog, delete confirmation, toast states, empty state, AI review, and revision history.
- Plans, tasks, and actions for execution hierarchy.
- Chat assistant for local workspace questions and confirmed safe actions.
- Design token system for a consistent desktop workspace UI.

## Current Repository Baseline

This is not a greenfield app. The current package already includes a React 19/Vite/Tailwind v4 dashboard under `extensions/mabos/extensions-mabos/ui`, with TanStack Router, TanStack Query, shadcn-style local components, dashboard routes, onboarding, goals, tasks, and chat-oriented components.

The desktop plan should therefore extend the existing MABOS UI and backend extension rather than replacing them. Phase 0 should focus on formalizing a desktop shell path, local-first persistence, and native boundaries around the current app.

## Recommended Stack

Use Tauri 2 + React + TypeScript + Vite + SQLite + Rust command layer.

| Layer          | Choice                                                | Rationale                                                                                                  |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Desktop shell  | Tauri 2                                               | Small, secure cross-platform desktop shell with native command boundaries and capability controls.         |
| UI             | Existing React 19 + TypeScript + Vite app             | Already matches the Figma-style productivity UI and existing MABOS dashboard.                              |
| Styling        | Tailwind CSS v4 + CSS variables                       | Already present; continue expanding canonical tokens in `ui/src/styles/design-tokens.css`.                 |
| Components     | Existing shadcn-style local components                | Keeps dialogs, buttons, cards, tabs, and shell controls local and extensible.                              |
| App state      | Zustand where useful, TanStack Query for async state  | Keep TanStack Query for API/cache state; add Zustand only for UI/session state that should not be fetched. |
| Local database | SQLite                                                | File-based, reliable, offline-first persistence for workspaces and operational records.                    |
| Query layer    | Drizzle ORM or a typed Rust SQL layer                 | Prefer Drizzle if data access remains TypeScript-side; prefer Rust SQL if Tauri owns persistence.          |
| Search         | SQLite FTS5                                           | Built-in full-text search across goals, plans, tasks, actions, chat, and research artifacts.               |
| AI integration | OpenAI Responses API with Structured Outputs          | Schema-constrained generation for records that must be reviewed before acceptance.                         |
| Packaging      | Tauri bundler                                         | Native installers for macOS, Windows, and Linux.                                                           |
| Testing        | Vitest, React Testing Library, Playwright, Rust tests | Unit, component, workflow, route, and command coverage.                                                    |

Electron remains a fallback only if MABOS needs Chromium-specific behavior or deep Node compatibility in the app shell. Flutter remains a fallback if the product shifts toward custom native-rendered UI across desktop and mobile. Wails remains a fallback only if the backend becomes Go-first.

## Architecture

MABOS should use a strict boundary between UI and privileged operations:

- Renderer: React routes, local form state, optimistic interaction state, review UIs, and desktop workspace views.
- Tauri Rust core: database access, filesystem access, credential storage, AI request proxying, import/export, background job orchestration, and audit logging.
- Remote APIs: OpenAI and optional SaaS connectors. API keys and SaaS secrets must never live in renderer code or SQLite plaintext.

## Data Model

Core local entities:

- Workspace
- BusinessProfile
- CredentialSource
- ResearchArtifact
- VisionMission
- CoreValue
- BusinessModelCanvas
- Goal
- Plan
- Task
- Action
- ChatThread
- ChatMessage
- GenerationJob
- AuditEvent

Secrets belong in OS secure storage. SQLite should store only credential metadata, connection state, and secure-store lookup handles.

## AI Contract

All AI generation should return typed records, not free-form text blobs.

Structured outputs should cover:

- Onboarding extraction from business descriptions.
- Business model canvas auto-population.
- Goal generation.
- Goal-to-plan decomposition.
- Plan-to-task decomposition.
- Task-to-action decomposition.
- Research summary extraction.
- Chat assistant tool calls.

Each generated object should include:

- `title`
- `description`
- `rationale`
- `confidence`
- `assumptions`
- `sourceInputs`
- `requiresReview`

Generated records must be staged first, then accepted, edited, or discarded by the user. Accepted records must create audit events.

## Phased Plan

### Phase 0: Desktop Foundation

Outcome: the repo has a clear desktop development path using the existing MABOS UI.

Tasks:

- Add a Tauri 2 app wrapper for the existing MABOS React/Vite UI.
- Keep the existing dashboard route tree and map Figma surfaces onto it.
- Expand design tokens for background, surface, border, text, muted text, primary blue, success, warning, danger, radius, spacing, and type scale.
- Identify which existing shell components can serve as the desktop app frame, sidebar, page header, dialogs, toasts, form fields, segmented controls, progress indicators, cards, and empty states.
- Add desktop build and smoke commands without disrupting the OpenClaw extension build.
- Document the Figma token-to-code mapping in or near `ui/src/styles/design-tokens.css`.

Validation gate:

- Desktop shell launches locally.
- Landing/workspace and empty workspace routes render without remote data.
- Existing extension UI build still passes.

### Phase 1: Local Data And Workspace Skeleton

Outcome: local-first workspace records persist and can be recovered after restart.

Tasks:

- Add SQLite database in the desktop app data directory.
- Add schema/migrations for the core entities.
- Implement typed Tauri commands for initialization, migrations, CRUD, search, and transactional writes.
- Add a typed IPC bridge between React and Tauri commands.
- Implement workspace creation, workspace selection, and audit events.
- Add FTS5 tables for searchable business profiles, goals, plans, tasks, actions, chat messages, and research artifacts.

Validation gate:

- Create a workspace, restart the app, and recover saved records.
- CRUD tests cover each core entity.
- Search returns expected local records.

### Phase 2: Landing And New Business Onboarding

Outcome: the 5-step new business onboarding flow works end to end.

Tasks:

- Build or adapt the landing route from Figma.
- Adapt the existing onboarding components into a persisted 5-step flow.
- Persist partial onboarding drafts locally.
- Add Zod validation.
- Add generated goal review states with accept, edit, and discard actions.

Validation gate:

- User can complete onboarding offline up to AI generation.
- User can resume interrupted onboarding.
- Generated goal placeholders can be accepted, edited, or discarded.

### Phase 3: AI Generation Pipeline

Outcome: MABOS can generate schema-valid strategic records from onboarding input.

Tasks:

- Implement secure OpenAI client access in the native command layer.
- Add prompt and schema version registries.
- Add structured output schemas for goals, plans, tasks, actions, BMC, research summary, vision/mission, and values.
- Implement `GenerationJob` queue statuses: `queued`, `running`, `succeeded`, `failed`, `cancelled`, `requires_review`, `accepted`.
- Add retry policy, refusal handling, visible error states, cost/token logging, and deterministic AI fixtures.

Validation gate:

- Generation produces schema-valid records.
- Invalid or refused outputs do not corrupt workspace data.
- Accepted records are audit logged.

### Phase 4: Existing Business Onboarding

Outcome: the 10-step existing business onboarding flow captures richer business context.

Tasks:

- Build business type, identity, credentials, description, SaaS stack, research summary, vision/mission, values, BMC, and review steps.
- Store credential metadata without SQLite secrets.
- Add connector placeholders for unimplemented SaaS tools.
- Add AI research summary and BMC review/edit workflows.

Validation gate:

- Flow completes without external SaaS connections.
- BMC, vision, mission, and values are editable before acceptance.
- Credentials appear as secure connection states, not plain local text.

### Phase 5: Workspace Dashboard

Outcome: the post-onboarding workspace gives an executive operating view.

Tasks:

- Adapt the current dashboard into a local-first desktop dashboard.
- Add summary cards for active goals, plans in progress, overdue tasks, actions due today, and AI recommendations.
- Add recent activity from `AuditEvent`, generation status panel, local search entry point, and empty/loading states.

Validation gate:

- Dashboard reflects local data changes immediately.
- No route requires remote network access to render.

### Phase 6: Goals Module

Outcome: users can manage strategic goals offline.

Tasks:

- Build goals list, create dialog, delete dialog, toasts, and empty states from Figma.
- Add filters by status, owner, timeframe, source, and confidence.
- Add goal detail view, AI acceptance workflow, revision history, and goal-to-plan generation action.

Validation gate:

- Manual and AI-generated goals share one data model.
- Goal deletion is guarded and audit logged.
- Goal creation works offline.

### Phase 7: Plans, Tasks, And Actions

Outcome: MABOS decomposes strategy into execution.

Tasks:

- Build plans, tasks, and actions routes around the execution hierarchy.
- Add status workflow, owner, due date, priority, dependencies, milestones, progress rollups, and daily action queue.
- Add AI decomposition for goal-to-plan, plan-to-task, and task-to-action.
- Add bulk review UI for generated items.

Validation gate:

- User can move from goal to plan to task to action in one workspace.
- AI-decomposed items are never committed without review.
- Progress rolls up correctly.

### Phase 8: Chat Assistant

Outcome: users can ask MABOS questions and trigger safe local actions.

Tasks:

- Build persistent chat threads scoped to workspace.
- Add retrieval context from local SQLite records and FTS5.
- Add safe tool schemas for creating draft goals/plans, summarizing workspace, searching records, and explaining progress.
- Require confirmation before mutating workspace data.
- Add citations to local records used in answers.

Validation gate:

- Chat answers cite local workspace records.
- Tool calls are schema-constrained and require confirmation for writes.
- Chat history persists locally.

### Phase 9: Desktop-Native Features

Outcome: MABOS feels like a native desktop product.

Tasks:

- Add native menus, keyboard shortcuts, secure credential storage, import/export, backup/restore, updater strategy, settings, and optional drag-and-drop imports.

Validation gate:

- App exports and restores a complete workspace backup.
- App packages for at least macOS and Windows.
- Sensitive settings are not exposed in renderer logs or SQLite.

### Phase 10: Quality, Security, And Release

Outcome: MABOS is ready for private beta.

Tasks:

- Threat model Tauri commands and capability files.
- Minimize permissions by window.
- Add opt-in error reporting.
- Add performance budgets: cold launch under 2 seconds, route transition under 150 ms for local data, AI generation progress visible within 500 ms.
- Add Playwright coverage for all Figma surfaces.
- Add migration recovery tests, signed builds, and release checklist.

Validation gate:

- Private beta build is signed, installable, and smoke-tested.
- Core routes have automated coverage.
- Database migrations are tested from clean install and prior versions.

## Milestone Map

| Milestone | Scope                                          | Target                        |
| --------- | ---------------------------------------------- | ----------------------------- |
| M0        | Desktop shell, tokens, local DB foundation     | Developer alpha               |
| M1        | New business onboarding and AI goal generation | First usable product loop     |
| M2        | Dashboard and goals                            | Strategy workspace usable     |
| M3        | Plans, tasks, and actions                      | Execution hierarchy usable    |
| M4        | Existing business onboarding and BMC           | Rich business import loop     |
| M5        | Chat assistant and local retrieval             | AI operating assistant usable |
| M6        | Packaging, backup, and security                | Private beta                  |

## Key Risks

| Risk                               | Impact                | Mitigation                                                                 |
| ---------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| AI output quality is inconsistent  | Bad strategic records | Use strict schemas, staged review, prompt versioning, and editable drafts. |
| Local-first sync is underestimated | Data conflicts later  | Start local-only, design IDs/revision history now, add sync later.         |
| Tauri permissions become too broad | Security exposure     | Define minimal capability files per window and command.                    |
| Credentials are mishandled         | High security risk    | Store secrets only in OS secure storage.                                   |
| Figma design lacks tokens          | Inconsistent UI       | Extend implementation tokens in Phase 0 and map each component to them.    |
| Desktop packaging surprises        | Release delay         | Add Tauri build smoke checks early.                                        |

## Source Links

- Tauri 2 overview: https://tauri.app/
- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri capabilities/security model: https://v2.tauri.app/fr/security/capabilities/
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Flutter desktop support: https://docs.flutter.dev/platform-integration/desktop
- Wails introduction: https://wails.io/docs/next/introduction
- SQLite FTS5: https://www.sqlite.org/fts5.html
- Drizzle SQLite docs: https://orm.drizzle.team/docs/get-started/sqlite-new
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
