# Task — CLI Engineer

Standard task template for incoming delegations.

## Communication protocol

MABOS uses FIPA-style ACL performatives for inter-agent messaging. See `extensions/mabos/extensions-mabos/src/tools/communication-tools.ts` for the canonical schema and `src/tools/directive-tools.ts` for dispatch examples (direct REQUEST and contract-net CFP). The shapes below mirror real workspace inboxes (e.g. `extensions/mabos/extensions-mabos/workspace/agents/ceo/inbox.json`).

## Inbox message shape

Other agents deliver CLI work to cli-engineer with an ACL REQUEST:

```json
{
  "id": "TASK-<short-id>",
  "from": "<requester-agent-id>",
  "to": "cli-engineer",
  "performative": "REQUEST",
  "subject": "cli-request",
  "content": "[CLI Request] action=<install|print|reprint|verify> target=<api-name|url|slug> notes=<optional>",
  "priority": "low | normal | high | urgent",
  "timestamp": "<ISO-8601>",
  "read": false,
  "task_id": "<requester's task id>",
  "goal_id": "<requester's goal id>",
  "plan_id": "<requester's plan id>"
}
```

The `subject` field is what `src/tools/cognitive-signal-scanners.ts` displays in the inbox summary; using `"cli-request"` makes the scanner output `Inbox: REQUEST from <requester> — cli-request`. Structured fields (`action`, `target`, `notes`) are encoded into `content` as a single line so the message stays scannable; cli-engineer parses them out before executing.

## Response shape

cli-engineer replies with an ACL INFORM (success) or REJECT (failure):

```json
{
  "id": "TASK-<short-id>",
  "from": "cli-engineer",
  "to": "<requester-agent-id>",
  "performative": "INFORM",
  "subject": "cli-result",
  "content": "[CLI Result] status=succeeded slug=<cli-slug> binary=<absolute-path> skill=/pp-<slug> auth_required=<env-var-list|none>",
  "priority": "normal",
  "timestamp": "<ISO-8601>",
  "read": false,
  "task_id": "<echo from request>",
  "goal_id": "<echo from request>",
  "plan_id": "<echo from request>"
}
```

On failure, use `performative: "REJECT"` and structure `content` as:

```
[CLI Result] status=failed phase=<search|install|print|verify> message=<verbatim error> next_steps=<retry|provide-auth|escalate>
```

## Capability registration

The mechanism by which cli-engineer announces a new CLI to the rest of the MABOS roster is **deferred — not yet wired**. Two viable approaches once we decide:

- **ACL INFORM to a registry agent.** If MABOS adds a `tool-registry` agent, emit an INFORM with `subject: "capability-add"` and the new CLI's metadata in `content`. Same shape as the response above, addressed to `tool-registry`.
- **Direct file-based registration.** Write into a shared `~/.openclaw-mabos/tool-registry.json` (or equivalent) so other agents discover new capabilities on their next BDI cycle. Avoids needing a new agent but couples cli-engineer to a global file.

For v1, cli-engineer's response message (INFORM above) tells the requester the new CLI exists. The requester is responsible for noting it in its own Beliefs.md or onward routing. Capability-registration to a broader audience is a v2 question.

## Runtime smoke test

The intended smoke test is: a requester (e.g. CEO) drops a REQUEST in cli-engineer's inbox, an orchestrator (`extensions/mabos/extensions-mabos/scripts/director-orchestrator.ts` or `run-heartbeat.ts`) triggers a BDI cycle for cli-engineer, cli-engineer processes the request, and INFORMs back. The exact orchestrator-trigger command was **not verified** in the implementation plan that authored this template — see `docs/plans/2026-05-22-cli-agent-design.md` "Verification log" for the deferred status.

To enable the smoke test in a future session: instantiate cli-engineer in `extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/`, drop a properly-shaped REQUEST in `workspace/agents/cli-engineer/inbox.json`, and run the appropriate `director-orchestrator.ts` invocation. Verify cli-engineer's outbound INFORM lands in the requester's inbox (or wherever responses are routed).
