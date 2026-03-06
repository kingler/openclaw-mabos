# MABOS + OpenClaw Unified Execution Plan

Date: 2026-03-06
Scope: Align the combined project so OpenClaw architecture is extended by MABOS operational/business layers without breaking shared platform capabilities.

## 1. Lock Architecture Decisions First (P0)

1. Define command ownership in MABOS mode.
2. MABOS-owned conflicts: `onboard`, MABOS business lifecycle commands.
3. Shared OpenClaw ops retained: `gateway`, `status`, `config`, `plugins`, `channels`, `update`.
4. Define business context contract: runtime/services/tools/UI must resolve business dynamically.
5. Prohibit tenant-specific runtime assumptions such as hardcoded `vividwalls`.

## 2. Build Safety-Net Tests Before Code Changes (P0)

1. Add CLI integration tests for command resolution:
   - `mabos onboard` resolves to MABOS behavior, not OpenClaw core onboarding.
   - Conflicting vs non-conflicting command precedence in MABOS mode.
2. Add config behavior tests:
   - Empty config in MABOS mode.
   - Existing allowlist that omits `mabos`.
   - Explicit `deny` and explicit `enabled: false` remain authoritative.
3. Add cron bridge tests:
   - Multi-business add/update behavior.
   - Business-scoped orphan cleanup correctness.
4. Add API tests for agent files/avatar with business-scoped resolution.

## 3. Implement Robust MABOS Plugin Activation (P0)

1. Introduce a centralized `ensureMabosProductPluginConfig` helper.
2. Use it in config-load path and setup-write path.
3. Behavior rules:
   - In MABOS mode, enforce `plugins.entries.mabos.enabled = true` unless explicitly disabled/denied.
   - If `plugins.allow` exists, ensure it contains `mabos` unless denied.
   - Preserve explicit user intent (`deny`, explicit disable) over defaults.
4. Update `setup` so persistent config reflects this policy.

## 4. Fix CLI Routing and Command Precedence (P0)

1. Remove nested `program.command("mabos")` from MABOS plugin CLI registration.
2. Register MABOS commands as top-level commands in MABOS mode.
3. Implement mode-aware precedence in CLI bootstrap:
   - Conflicting core placeholders must not suppress MABOS command registration.
   - Non-conflicting OpenClaw commands remain available.
4. Add compatibility handling for legacy `mabos mabos ...` only if needed:
   - Temporary alias.
   - Warning output.
   - Time-bounded deprecation window.

## 5. De-Hardcode Business Assumptions in Two Waves

### Wave P0 (Runtime-Critical)

1. Replace hardcoded business paths in MABOS API handlers.
2. Replace cron seed `vw-*` agent IDs with business-role-derived IDs.
3. Update integration tools (Twilio/SendGrid/GoDaddy/Cloudflare and similar) to resolve business-scoped `integrations.json` dynamically.
4. Remove single default business constants in services; discover businesses from workspace.

### Wave P1 (Presentation / Non-Critical)

1. Replace UI-wide `BUSINESS_ID = "vividwalls"` with active business context/state.
2. Clean product-facing docs/examples/defaults so `vividwalls` is only sample data where intentional.
3. Keep fixture/sample references isolated and explicitly labeled as examples.

## 6. Redesign Cron Bridge Ownership Model (P0)

1. Tag parent cron jobs with business ownership metadata (for example in name/description).
2. Make orphan cleanup strictly business-scoped.
3. Sync loop design:
   - Enumerate businesses.
   - Sync each business independently.
   - Never delete parent jobs for other businesses during a business sync.
4. Align workspace fallback resolution with MABOS state conventions (`~/.mabos`) rather than legacy assumptions.

## 7. Migration, Docs, and UX Alignment (P1)

1. Update root and extension README config examples to:
   - `plugins.entries.mabos.enabled`
2. Update setup/help text to show MABOS-specific paths in MABOS mode.
3. Update migration checks (`mabos migrate` / setup flow) to normalize plugin enablement and allowlist compatibility.
4. Document command compatibility/deprecation behavior clearly.

## 8. Verification Gates and Rollout

1. Required checks:
   - Targeted vitest suites for CLI/config/plugins/cron/API/UI business resolution.
   - `pnpm build`.
   - Focused MABOS smoke flow:
     - fresh state
     - `mabos setup`
     - `mabos onboard`
     - business creation
     - cron sync
     - dashboard/API checks
2. Recommended rollout sequence:
   - PR-A: tests + config normalization helper + setup persistence.
   - PR-B: CLI precedence + top-level MABOS commands.
   - PR-C: runtime de-hardcoding + cron bridge ownership fixes.
   - PR-D: UI business context + docs/migration polish.
