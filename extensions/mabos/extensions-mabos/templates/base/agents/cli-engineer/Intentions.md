# Intentions — CLI Engineer

Plans the agent has committed to and is actively executing.

## Intention shape

```yaml
goal_id: <slug>
plan: <plan-name from Plans.md>
step: <current-step-name>
started_at: <ISO-8601>
last_progress_at: <ISO-8601>
artifacts: []
```

## Single-minded commitment

Per `agent.json` (`commitmentStrategy: single-minded`), once committed to a print, the agent does not drop the intention to chase a higher-priority new goal mid-print. New higher-priority goals queue behind the current intention. Aborts only on failure or explicit caller cancellation.
