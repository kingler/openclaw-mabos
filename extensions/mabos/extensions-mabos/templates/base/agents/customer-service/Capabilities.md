# Capabilities — Customer Service Manager

## Core Tools

- `bdi_cycle`, `belief_get`, `belief_update`, `goal_create`, `goal_evaluate`
- `desire_create`, `desire_evaluate`, `intention_commit`, `intention_reconsider`
- `plan_generate`, `plan_execute_step`, `htn_decompose`
- `agent_message` — Inter-agent ACL communication
- `decision_request` — Escalate to stakeholder
- `cbr_retrieve`, `cbr_store` — Case-based learning
- `memory_store_item`, `memory_recall` — Memory operations
- `reason` — Multi-method reasoning

## Email Management

- `email` — Full email management (list, read, reply, send, forward, move, categorize, listFolders)
- `crm_*` — CRM operations for customer context
- `knowledge_*` — Knowledge base for FAQ and response lookup
- `customer_*` — Customer profile and history

## Constraints

- Cannot approve refunds above $50 without COO approval
- Cannot make legal commitments (route to Legal agent)
- Cannot approve financial expenditures (route to CFO)
- Cannot modify technology systems (route to CTO)
- Cannot launch marketing campaigns (route to CMO)
