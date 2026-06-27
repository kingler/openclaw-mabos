# MABOS Web Channel Integration Plan

**Goal:** Let a MABOS user connect a messenger channel (Telegram first; then Discord, Slack, Signal, WhatsApp) and external APIs from the MABOS web UI — pick a channel, paste credentials, test the connection, save — and have the channel **written through to the real OpenClaw gateway config** so it goes live without any terminal commands.

**Architecture:** A declarative channel catalog drives a dynamic UI form. A shared `channel-provisioning` module validates input, runs a live credential test (reusing the existing `testChannelConnection`), persists the secret as an env-var reference plus a `${VAR}` config entry bound to a business via `agentId`, then triggers a gateway config refresh. The MABOS plugin reaches the real gateway config through a new typed `plugin-sdk` config helper that wraps `src/config/io.ts`. The same flow is exposed as both an agent tool and gateway-authed HTTP routes that the React UI calls.

**Tech Stack:** TypeScript (ESM, Node 22), `@sinclair/typebox` (param schemas), `openclaw/plugin-sdk` (`AnyAgentTool`, `OpenClawPluginApi`, new config helper), React + TanStack Router + TanStack Query (`extensions/mabos/extensions-mabos/ui`), vitest.

---

## Current state (verified)

- `extensions/mabos/extensions-mabos/src/tools/setup-wizard-tools.ts` — `testChannelConnection()` already performs **live** credential checks (Telegram `getMe`, Discord `oauth2/applications/@me`, Slack `auth.test`, format checks for Signal/WhatsApp). `setup_channel` only writes a MABOS record to `<workspace>/channels/<id>.json` — it never writes the real gateway config.
- `extensions/mabos/extensions-mabos/src/tool-api/routes.ts` — registers gateway-authed HTTP routes via `api.registerHttpRoute({ path, auth: "gateway", handler })`.
- Real channel config lives in core: shapes in `src/config/types.telegram.ts` / `types.channels.ts`, validated by `src/config/zod-schema.channels.ts`. Each channel/account already supports `botToken` (inline), `tokenFile` (path, symlinks rejected), `${VAR}` env-var references (`src/config/io.ts`: `restoreEnvVarRefs`, `containsEnvVarReference`, `resolveConfigEnvVars`), and an `agentId` for routing.
- Config write path: `src/config/io.ts` → `readConfigFileSnapshotForWrite()` + `writeConfigFile()`; live refresh via `setRuntimeConfigSnapshotRefreshHandler`.
- MABOS UI conventions: `ui/src/router.ts` (TanStack Router), `ui/src/hooks/use*.ts` (React Query; mirror `useCronJobs.ts`), `ui/src/lib/api.ts` (shared client), `ui/src/lib/types.ts`, pages in `ui/src/pages/`.

## Resolved decisions

- **D1 — Config write path:** Add typed `config.read()/config.update()` to `plugin-sdk`, wrapping `readConfigFileSnapshotForWrite()` + `writeConfigFile()` with snapshot-hash optimistic concurrency. Clean, testable boundary; reusable by other extensions.
- **D2 — Secrets:** Write the token to an env var and store a `${VAR}` reference in config via the existing env-ref machinery. No plaintext tokens in `config.json`. Responses return masked credentials only; never log raw tokens.
- **D3 — Routing / multi-tenancy:** Each connected channel/account binds to a business by setting its `agentId` to that business's router agent; MABOS tags the entry with `businessId`. Channel config stays gateway-global. Consistent with `SECURITY.md` (single-operator trust model; no per-user multi-tenant auth on a shared config).
- **D4 — Live reload:** After write, trigger `setRuntimeConfigSnapshotRefreshHandler`. Verify in Phase 1 that a newly-added channel binds without a restart; if not, surface a "restart gateway" prompt in the UI.

---

## Phasing

- **Phase 1 (MVP):** plugin-sdk config helper + catalog (Telegram only) + provisioning module + routes + UI page, end-to-end. Proves the write-through and live-reload path.
- **Phase 2:** Discord, Slack, Signal, WhatsApp; enable/disable/remove; status polling.
- **Phase 3:** External-API tab (reuse `integration-tools.ts` → `businesses/<id>/integrations.json`); extension channels (matrix, msteams, zalo, twitch, nostr).

---

## Phase 1 tasks (Telegram vertical slice)

### Task 1 — plugin-sdk config helper (D1)
- Add `config.read()` and `config.update(mutator, { expectHash })` to the plugin API surface, wrapping `readConfigFileSnapshotForWrite()` + `writeConfigFile()` from `src/config/io.ts`, plus an env-ref write helper (set env var + store `${VAR}`).
- Expose through `OpenClawPluginApi` so `extensions/mabos` can call it.
- Tests: read/modify/write round-trip, snapshot-hash conflict rejection, env-ref substitution preserved on write.

### Task 2 — channel catalog
- New `extensions/mabos/extensions-mabos/src/channels/channel-catalog.ts`: descriptor per channel `{ type, label, icon, docsUrl, capabilities, fields[] }` where each field is `{ name, label, type, required, secret, placeholder, validationRegex }`.
- Phase 1: Telegram descriptor (`botToken` secret→env-ref; optional `agentId`, `businessId`).

### Task 3 — shared provisioning module
- New `extensions/mabos/extensions-mabos/src/channels/channel-provisioning.ts`:
  `validate (catalog) → testChannelConnection (reuse) → write env var + ${VAR} config entry with agentId → refresh → return masked status`.
- Refactor `setup-wizard-tools.ts` `setup_channel` to call this module (single implementation for agent tool + HTTP).

### Task 4 — HTTP routes
- In `src/tool-api/routes.ts` (or new `src/channels/routes.ts`), all `auth: "gateway"`:
  - `GET  /mabos/api/channels/catalog`
  - `GET  /mabos/api/channels` (configured + live status, masked creds)
  - `POST /mabos/api/channels/test` (test only, never persists)
  - `POST /mabos/api/channels` (validate → test → write-through → refresh)

### Task 5 — Frontend
- `ui/src/lib/types.ts`: `ChannelDescriptor`, `ConfiguredChannel`, `ChannelTestResult`.
- `ui/src/lib/api.ts`: `getChannelCatalog`, `getChannels`, `testChannel`, `saveChannel`.
- `ui/src/hooks/useChannels.ts`: queries + mutations (mirror `useCronJobs.ts`).
- `ui/src/pages/IntegrationsPage.tsx`: connected list + "Add channel" → pick Telegram → dynamic form (reuse `onboarding/InlineForm.tsx`) → Test → Save. Register in `ui/src/router.ts` + sidebar nav.

### Task 6 — Verify + tests
- Confirm D4 (live reload binds the new Telegram channel without restart); fall back to restart prompt if not.
- Tests: config write-through (mock io.ts helper), credential masking, route auth, UI form render + test/save flows.

---

## Phase 1 status (Telegram vertical slice — implemented)

- **Config write-through (D1):** `src/plugin-sdk/config-write.ts` adds `updateGatewayConfig(mutator)` + `setDurableSecretEnv(id, value)` + `envSecretRefTemplate(id)`, re-exported from `src/plugin-sdk/index.ts`. Implemented as standalone typed functions rather than new `OpenClawPluginApi` methods to avoid the broad blast radius of changing the API interface (many test constructors).
- **Secrets (D2):** secrets are written to the gateway's durable dotenv (`<configDir>/.env`, loaded by `loadDotEnv` at startup) and referenced from config as `${ENV}`. `process.env` is set in-process so the immediate refresh resolves without a restart.
- **Live reload (D4):** verified by code inspection that `writeConfigFile` (config/io.ts) invokes `runtimeConfigSnapshotRefreshHandler.refresh()` internally, so the channel goes live on write. End-to-end runtime verification is pending an environment with dependencies installed (local install is blocked by an org-policy 403 on the transitive `libsignal-node` git dependency).
- **Catalog/provisioning:** `extensions/mabos/.../src/channels/channel-catalog.ts` (Telegram descriptor) + `channel-provisioning.ts` (`provisionChannel`, `testChannelConnection`, `listConfiguredChannels`). `setup-wizard-tools.ts` now reuses the shared `testChannelConnection` (dedup).
- **HTTP routes:** `channels/routes.ts` registers `GET /mabos/api/channels/catalog`, `GET /mabos/api/channels`, `POST /mabos/api/channels/test`, `POST /mabos/api/channels` (all `auth: "gateway"`), wired in `index.ts`.
- **UI:** `IntegrationsPage.tsx` + `useChannels.ts` + api/types + router + nav ("Setup -> Integrations").
- **Tests:** `tests/channel-integration.test.ts` covers catalog validation, env-ref write-through, secret masking, and record listing (plugin-sdk config boundary mocked).

## Phase 2 status (more channels + lifecycle — implemented)

- **Channels added:** Discord, Slack, Signal. Field-to-config mappings reflect the real gateway shapes: Discord `bot_token -> token` (secret) with `application_id` test-only (`persist: false`, not stored); Slack `botToken`/`appToken`/`signingSecret`; Signal `account` + `cli_url -> httpUrl` (no secret).
- **WhatsApp deferred (scope correction):** OpenClaw's WhatsApp is session/QR-based (Baileys) with no Cloud-API token fields in config, so it does not fit the paste-credentials form. It needs a separate QR-pairing flow and is left as a follow-up rather than shipping a broken form.
- **Lifecycle:** enable/disable (`PATCH /mabos/api/channels/:id`), remove (`DELETE /mabos/api/channels/:id`), and live status (`GET /mabos/api/channels/:id/status`). Status re-runs the credential test by reconstructing inputs from the durable env secret + stored non-secret values (records keep `envRefs`/`publicCredentials`, stripped from list responses).
- **Catalog field model:** added `persist?: boolean` for test-only fields.
- **UI:** Integrations page now shows per-channel live status (30s polling), enable/disable, and remove.
- **Tests:** extended `tests/channel-integration.test.ts` with Discord/Signal mappings and enable/disable/remove/status (network mocked).

## Risks / notes

- **Live reload (D4)** is the main unknown — verify early; it gates the "no terminal" promise.
- **Secret hygiene (D2):** ensure the env var is written to the gateway's environment source, not just process memory, so it survives restart.
- **Routing (D3):** a Telegram account maps to one `agentId`; confirm MABOS exposes a per-business router agent id to bind to.
- Keep raw tokens out of logs and HTTP responses everywhere.
