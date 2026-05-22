# Goals — CLI Engineer

Active, time-bound commitments derived from caller requests.

## Goal template

```yaml
id: <slug>
type: install | print | reprint | verify
target: <api-or-url-or-slug>
requester: <agent-id>
deadline: <ISO-8601 timestamp>
status: pending | in-progress | succeeded | failed
result: <binary-path-and-skill-name on success | error string on failure>
```

## Active goals

Populated at runtime from `inbox.json`. Workspace instance only; the template version is empty.

## Goal selection

When multiple goals are pending, prioritize by:

1. Caller priority (CEO > C-suite > line agents).
2. Deadline (earliest first).
3. Estimated effort (install < reprint < print).
