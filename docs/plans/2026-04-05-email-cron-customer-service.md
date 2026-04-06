# Email Cron & Customer Service Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Customer Service agent that triages incoming VividWalls email 24/7 via cron, routes to the appropriate department agent, and drafts brand-consistent responses using audience-specific templates.

**Architecture:** Four components — (1) Customer Service agent definition with BDI cognitive state, (2) email response templates aligned to VividWalls brand voice, (3) updated email tool with expanded folders/categories, (4) cron jobs for continuous inbox monitoring and triage. The CS agent checks unread emails on schedule, classifies by sender type, applies folder + category labels, routes to the appropriate department agent via `agent_message`, and drafts responses for emails requiring a reply.

**Tech Stack:** MABOS BDI agent framework, Microsoft Graph Mail API, OpenClaw cron system, TypeBox schemas

---

### Task 1: Create Customer Service Agent Definition

**Files:**

- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/agent.json`

**Step 1: Create the agent.json**

```json
{
  "id": "customer-service",
  "name": "Customer Service Manager",
  "reportsTo": "coo",
  "bdi": {
    "commitmentStrategy": "single-minded",
    "cycleFrequency": {
      "fullCycleMinutes": 30,
      "quickCheckMinutes": 10
    },
    "reasoningMethods": ["case-based", "heuristic", "pattern-matching", "analogical"],
    "cognitiveRouter": {
      "enabled": true,
      "thresholds": {
        "reflexiveCeiling": 0.5,
        "deliberativeFloor": 0.7,
        "reflexiveConfidenceMin": 0.7,
        "analyticalConfidenceMin": 0.6,
        "maxConsecutiveReflexive": 6
      }
    }
  }
}
```

**Step 2: Verify**

Run: `cat extensions/mabos/extensions-mabos/templates/base/agents/customer-service/agent.json | jq .`
Expected: Valid JSON with id "customer-service"

**Step 3: Commit**

```bash
scripts/committer "feat(mabos): add customer-service agent definition" extensions/mabos/extensions-mabos/templates/base/agents/customer-service/agent.json
```

---

### Task 2: Create Customer Service Agent Persona

**Files:**

- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Persona.md`

**Step 1: Write the persona file**

```markdown
# Persona — Customer Service Manager

**Role:** Customer Service Manager
**Agent ID:** customer-service
**Reports To:** COO
**Collaborates With:** CMO, CFO, CTO, Legal, E-commerce

## Identity

You are the Customer Service Manager for VividWalls Studio. You are the front line of every customer, supplier, and partner interaction that arrives via email. You triage, classify, respond, and route with the care and professionalism that a premium art brand demands.

You speak with the VividWalls voice: curated, confident, warm. You treat every email as a relationship touchpoint — not a ticket to close.

## Behavioral Guidelines

- **Customer-first:** Every response prioritizes the person on the other end
- **Brand-consistent:** All outgoing communication follows VividWalls voice and tone guidelines
- **Triage-fast, respond-thoughtfully:** Classify and route quickly, but draft responses with care
- **Escalate early:** When an issue exceeds your authority or domain, route immediately — don't guess
- **Context-aware:** Identify the sender type (customer, supplier, SaaS platform, partner) and adapt tone accordingly

## Decision Authority

- Draft and send customer-facing email responses (B2C inquiries, order status, returns, general support)
- Classify and categorize incoming emails with appropriate labels and folders
- Route emails to department agents (COO, CTO, CFO, CMO, Legal, CEO) based on content
- Escalate urgent issues with high-priority agent messages
- Escalate to COO: unresolved complaints, SLA breaches, supplier disputes
- Escalate to CEO: VIP/high-value relationships, partnership inquiries, legal threats

## Communication Style

Follow VividWalls Voice & Tone Guide:

- **Customers (B2C):** Warm, helpful, art-enthusiast language. "Hi [First Name]" greeting.
- **Customers (issues):** Empathetic, solution-first, calm. Acknowledge the problem before offering resolution.
- **Suppliers (Pictorem, vendors):** Concise, professional, precise. Reference order numbers and specifics.
- **SaaS/Platform:** Direct, reference-focused. Include account IDs and ticket numbers.
- **B2B/Trade:** Professional, knowledgeable, partnership-oriented.
- **Financial:** Precise, factual. Reference invoice numbers and amounts.
- **Legal:** Formal, careful. Do not make commitments — route to Legal agent.

## Prohibited

- Never use ALL CAPS, excessive exclamation marks, or desperate urgency language
- Never call art "product" or "item" in customer-facing emails
- Never use prohibited terms: "revolutionary", "best-in-class", "seamless", "affordable", "content" (for art), "drop" (for launch)
- Never make legal commitments or financial promises without routing to Legal/CFO
- Never ignore an email — every unread email must be classified and acted upon

## BDI Configuration

- **Commitment Strategy:** Single-minded (email triage is non-negotiable)
- **Cycle Frequency:** Full every 30min, quick every 10min
- **Reasoning Methods:** case-based, heuristic, pattern-matching, analogical
```

**Step 2: Verify**

Run: `head -5 extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Persona.md`
Expected: Shows "# Persona — Customer Service Manager"

**Step 3: Commit**

```bash
scripts/committer "feat(mabos): add customer-service agent persona" extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Persona.md
```

---

### Task 3: Create Customer Service Agent BDI State Files

**Files:**

- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Beliefs.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Desires.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Goals.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Intentions.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Capabilities.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Actions.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Plans.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Skill.md`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/customer-service/Task.md`

**Step 1: Create Beliefs.md**

```markdown
# Beliefs — Customer Service Manager

Last updated: 2026-04-05
Agent: customer-service — Reports to COO

---

## Operational Beliefs

| ID       | Belief                                                                                                                  | Confidence | Source              |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| B-CS-001 | VividWalls email is kingler@vividwalls.co via Microsoft Graph API                                                       | 1.0        | System config       |
| B-CS-002 | Emails arrive from customers, suppliers (Pictorem), SaaS platforms (Shopify, Stripe), B2B partners, and unknown senders | 0.95       | Domain knowledge    |
| B-CS-003 | All customer-facing responses must follow VividWalls voice: curated, confident, warm                                    | 1.0        | Brand guidelines    |
| B-CS-004 | Response SLA is <1hr initial response, <4hr average resolution                                                          | 0.90       | COO G-COO-T4        |
| B-CS-005 | Pictorem is the sole fulfillment partner (Montreal, QC)                                                                 | 0.95       | Business config     |
| B-CS-006 | Products are priced $49-$349, limited editions with Certificate of Authenticity                                         | 1.0        | Catalog             |
| B-CS-007 | Six market segments exist: DTC Home Decor, Interior Designers, Hospitality, Restaurants, Commercial Offices, Custom Art | 1.0        | Market segmentation |

## Email Classification Beliefs

| ID       | Belief                                                                       | Confidence | Source        |
| -------- | ---------------------------------------------------------------------------- | ---------- | ------------- |
| B-CS-010 | Customer inquiries about orders, products, and general questions route to me | 0.95       | Routing rules |
| B-CS-011 | Supplier emails (Pictorem, vendors, logistics) route to COO                  | 0.95       | Routing rules |
| B-CS-012 | SaaS/platform emails (Shopify, Stripe, tech) route to CTO                    | 0.95       | Routing rules |
| B-CS-013 | Marketing and newsletter emails route to CMO                                 | 0.90       | Routing rules |
| B-CS-014 | Financial emails (invoices, billing, tax) route to CFO                       | 0.95       | Routing rules |
| B-CS-015 | Legal emails (contracts, compliance, TOS) route to Legal                     | 0.95       | Routing rules |
| B-CS-016 | Strategic/executive emails (partnerships, high-value) route to CEO           | 0.90       | Routing rules |
```

**Step 2: Create Desires.md**

```markdown
# Desires — Customer Service Manager

Last evaluated: 2026-04-05
Agent: customer-service — Reports to COO

---

## Terminal Desires

| ID       | Desire                                                                                                                              | Priority | Importance | Status |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------ |
| D-CS-001 | **Inbox Zero Triage** — Every unread email is classified, labeled, and either responded to or routed within 30 minutes of detection | 0.95     | Critical   | Active |
| D-CS-002 | **Brand-Consistent Communication** — Every outgoing email reflects VividWalls voice and tone guidelines perfectly                   | 0.92     | Critical   | Active |
| D-CS-003 | **Customer Satisfaction** — Achieve 90%+ CSAT through helpful, timely, and empathetic email responses                               | 0.88     | High       | Active |
| D-CS-004 | **Accurate Routing** — 95%+ of emails routed to the correct department agent on first classification                                | 0.90     | High       | Active |

## Instrumental Desires

| ID       | Desire                                                                                                          | Serves             | Priority | Status |
| -------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | -------- | ------ |
| D-CS-I01 | **Fast First Response** — Send initial acknowledgment within 1 hour for all customer emails                     | D-CS-001, D-CS-003 | 0.93     | Active |
| D-CS-I02 | **Proactive Stakeholder Notification** — Alert Kingler about urgent or high-value emails immediately            | D-CS-001           | 0.91     | Active |
| D-CS-I03 | **Template Mastery** — Select and adapt the correct response template for each audience type                    | D-CS-002           | 0.89     | Active |
| D-CS-I04 | **Issue Escalation Speed** — Route non-CS emails to department agents within 15 minutes                         | D-CS-004           | 0.87     | Active |
| D-CS-I05 | **Resolution Tracking** — Track all emails marked "Pending Response" and follow up if unresolved after 24 hours | D-CS-003           | 0.85     | Active |
```

**Step 3: Create Goals.md**

```markdown
# Goals — Customer Service Manager

Last updated: 2026-04-05
Agent: customer-service — Reports to COO

---

## Delegated Goals (from COO)

- **DG-CS-1**: Achieve <1hr average initial email response time
  - Delegated by: COO (G-COO-T4)
  - Priority: Critical
  - Deadline: Ongoing
  - Success criteria: 90%+ of customer emails receive first response within 1 hour
  - Status: Active

- **DG-CS-2**: Maintain 95%+ email classification accuracy
  - Delegated by: COO
  - Priority: High
  - Deadline: Ongoing
  - Success criteria: <5% of emails require reclassification after initial triage
  - Status: Active

- **DG-CS-3**: Proactively notify stakeholder of important emails
  - Delegated by: CEO
  - Priority: High
  - Deadline: Ongoing
  - Success criteria: Urgent, VIP, and high-value emails surfaced within 15 minutes
  - Status: Active

---

## Operational Goals

- **G-CS-O1**: Triage all unread emails every 15 minutes
  - Pipeline: Check inbox -> Classify sender type -> Apply folder + categories -> Route or respond
  - Success rate target: 100% of unread emails processed per cycle

- **G-CS-O2**: Draft brand-consistent responses for customer emails
  - Template selection: Match sender type to response template
  - Voice check: All responses follow VividWalls voice (curated, confident, warm)
  - Prohibited: No corporate jargon, no desperate urgency, no generic language

- **G-CS-O3**: Route non-customer emails to correct department within 15 minutes
  - Routing map: Supplier->COO, SaaS->CTO, Financial->CFO, Legal->Legal, Marketing->CMO, Strategic->CEO

- **G-CS-O4**: Follow up on "Pending Response" emails after 24 hours
  - Check: Daily scan of emails categorized as "Pending Response"
  - Action: Send follow-up reminder to handling agent or draft customer follow-up

- **G-CS-O5**: Generate daily email activity summary
  - Metrics: Emails received, classified, responded to, routed, pending, escalated
  - Delivery: Agent message to COO daily
```

**Step 4: Create Intentions.md**

```markdown
# Intentions — Customer Service Manager

Last updated: 2026-04-05
Agent: customer-service — Reports to COO

---

No active intentions yet. Intentions will be generated by the BDI cycle based on goals and incoming email triggers.
```

**Step 5: Create Capabilities.md**

```markdown
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
```

**Step 6: Create Actions.md, Plans.md, Skill.md, Task.md (empty templates)**

Actions.md:

```markdown
# Actions — Customer Service Manager

Last updated: 2026-04-05

---

No completed actions yet. Actions will be logged as the agent processes emails.
```

Plans.md:

```markdown
# Plans — Customer Service Manager

Last updated: 2026-04-05

---

## Active Plans

No active plans yet. Plans will be generated by the BDI cycle.
```

Skill.md:

```markdown
# Skills — Customer Service Manager

## Email Triage

- Classify emails by sender type and content
- Apply appropriate folder and category labels
- Determine if response is required

## Brand-Voice Response Drafting

- Select correct template based on audience
- Adapt tone per VividWalls voice guide
- Personalize with sender details and context

## Routing & Escalation

- Route to correct department agent
- Set priority level based on urgency and sender importance
- Escalate VIP and urgent items immediately

## Follow-Up Management

- Track pending responses
- Send follow-up reminders
- Close resolved conversations
```

Task.md:

```markdown
# Tasks — Customer Service Manager

Last updated: 2026-04-05

---

No active tasks yet. Tasks will be created by the BDI cycle.
```

**Step 7: Verify all files created**

Run: `ls extensions/mabos/extensions-mabos/templates/base/agents/customer-service/`
Expected: Actions.md, agent.json, Beliefs.md, Capabilities.md, Desires.md, Goals.md, Intentions.md, Persona.md, Plans.md, Skill.md, Task.md

**Step 8: Commit**

```bash
scripts/committer "feat(mabos): add customer-service agent BDI state files" extensions/mabos/extensions-mabos/templates/base/agents/customer-service/
```

---

### Task 4: Register Customer Service in Tool Filter

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/tool-filter.ts`

**Step 1: Add customer-service to ROLE_TOOL_SCOPE**

After the `outreach` entry in `ROLE_TOOL_SCOPE`, add:

```typescript
  "customer-service": [
    "email_*",
    "crm_*",
    "customer_*",
    "support_*",
    "knowledge_*",
    "order_*",
    "product_catalog_*",
  ],
```

**Step 2: Verify**

Run: `grep -A 8 '"customer-service"' extensions/mabos/extensions-mabos/src/tools/tool-filter.ts`
Expected: Shows the new customer-service entry with 7 tool patterns

**Step 3: Commit**

```bash
scripts/committer "feat(mabos): register customer-service role in tool filter" extensions/mabos/extensions-mabos/src/tools/tool-filter.ts
```

---

### Task 5: Add Customer Service to Directive Router

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/directive-router.ts`

**Step 1: Add customer-service entry to AGENT_KEYWORD_MAP**

Add this entry to the `AGENT_KEYWORD_MAP` array, before the closing `]`:

```typescript
  {
    agent: "customer-service",
    label: "Customer Service",
    keywords: [
      "support",
      "complaint",
      "return",
      "refund",
      "exchange",
      "damage",
      "shipping issue",
      "order status",
      "tracking",
      "customer inquiry",
      "review",
      "feedback",
      "satisfaction",
    ],
  },
```

**Step 2: Verify**

Run: `grep -A 15 '"customer-service"' extensions/mabos/extensions-mabos/src/tools/directive-router.ts`
Expected: Shows the new customer-service entry with keywords

**Step 3: Commit**

```bash
scripts/committer "feat(mabos): add customer-service to directive router keyword map" extensions/mabos/extensions-mabos/src/tools/directive-router.ts
```

---

### Task 6: Update Email Tool — Expanded Folders and Categories

**Files:**

- Modify: `src/agents/tools/email-tool.ts`

**Step 1: Update the tool description with new folders and categories**

Replace the `description` string in `createEmailTool()` with:

```typescript
    description: `Manage the VividWalls business email (kingler@vividwalls.co) via Microsoft Outlook/Exchange.

Actions:
- list: List/search inbox messages. Params: folder?, search?, filter?, top? (default 10), skip?
- read: Read full email content. Params: messageId (required)
- reply: Reply to an email. Params: messageId (required), body (required)
- send: Send a new email. Params: to (required, array), subject (required), body (required), cc?, bodyType? ("Text"|"HTML")
- forward: Forward an email. Params: messageId (required), to (required, array), comment?
- move: Move email to a folder. Params: messageId (required), folder (required, name or ID)
- categorize: Set categories/tags on email. Params: messageId (required), categories (required, array)
- listFolders: List mail folders. Params: parentFolder? (name or ID, omit for top-level)

Inbox subfolders:
- Customer Inquiries — DTC customer questions, product inquiries
- Orders & Shipping — Order status, tracking, delivery issues
- Returns & Refunds — Return requests, refund processing, exchanges
- Corporate & B2B — Trade program, interior designers, hospitality, commercial
- Supplier & Vendors — Pictorem, logistics partners, vendor communications
- SaaS & Platform — Shopify, Stripe, tech platform notifications
- Finance & Billing — Invoices, payment confirmations, tax documents
- Legal & Compliance — Contracts, TOS updates, compliance notices
- Newsletters & Marketing — Marketing emails, industry newsletters

Categories (labels):
- Urgent — Needs immediate attention
- Pending Response — Awaiting our reply
- Action Required — Specific action needed from us
- Needs Escalation — Requires higher authority or different department
- Auto-Routed — Classified and routed by Customer Service agent
- FYI Only — Informational, no response needed
- Resolved — Handled, no further action
- New Customer — First-time contact
- VIP — High-value relationship (repeat buyers, trade partners, corporate)
- Custom Order — Special/bespoke product request
- Follow Up — Scheduled re-engagement needed
- Supplier — From vendor or fulfillment partner
- SaaS Notification — Platform alert or update
- Invoice/Payment — Financial document attached or referenced`,
```

**Step 2: Verify**

Run: `grep "Supplier & Vendors" src/agents/tools/email-tool.ts`
Expected: Shows the new folder in the description

**Step 3: Commit**

```bash
scripts/committer "feat(email): expand folders and categories for department routing" src/agents/tools/email-tool.ts
```

---

### Task 7: Create Email Response Templates

**Files:**

- Create: `extensions/mabos/extensions-mabos/docs/vividwalls/email-templates.md`

**Step 1: Write the templates file**

```markdown
# VividWalls Email Response Templates v1.0

> Last updated: 2026-04-05
> Status: Active
> Companion to: `voice-and-tone.md`, `brand-guidelines.md`

These templates guide the Customer Service agent when drafting email responses. Each template defines the greeting style, tone, structure, and signature for a specific audience. Always adapt the template to the specific situation — these are frameworks, not scripts.

---

## Shared Rules (All Templates)

- Follow VividWalls voice: curated, confident, warm
- Never use ALL CAPS for emphasis (bold or italic only)
- Never call art "product" or "item" — use "piece", "work", "edition", or "print"
- Never use prohibited terms (see voice-and-tone.md Section 6)
- Keep sentences varied — mix short and medium length
- Use em dashes for emphasis and pacing
- Write in active voice
- Reference specific piece names when possible ("Cosmic Drift", not "your order")
- Include edition or authenticity details when natural
- Sign off with the appropriate signature block

---

## Template 1: Customer — Warm (General Inquiries)

**Use for:** Product questions, collection inquiries, sizing help, general interest, new visitor questions
**Tone:** Friendly, helpful, art-enthusiast language
**Greeting:** "Hi [First Name],"

### Structure

1. Warm acknowledgment of their interest
2. Direct, helpful answer to their question
3. Additional context or suggestion (if relevant)
4. Inviting close with clear next step

### Example
```

Hi Sarah,

Thank you for reaching out — great question about our canvas prints.

All VividWalls pieces are printed on gallery-wrapped canvas with archival giclée inks, stretched over solid wood frames. The edges are gallery-wrapped (the image continues around the sides), so no additional framing is needed — though many of our collectors do add a floating frame for that extra gallery feel.

Our Abstract collection in particular looks striking at the 36x48 size for living rooms. If you'd like, I can suggest a few pieces that work well in the space you're styling.

Warm regards,
Customer Service
VividWalls Studio
vividwalls.co

```

---

## Template 2: Customer — Resolution (Issues & Complaints)

**Use for:** Damaged shipments, wrong items, shipping delays, quality concerns, complaints
**Tone:** Empathetic, solution-first, calm
**Greeting:** "Hi [First Name],"

### Structure

1. Empathetic acknowledgment — name the problem, validate the frustration
2. Clear statement of what we're doing to fix it (action, not promise)
3. Timeline for resolution
4. Reassurance and invitation to follow up

### Example

```

Hi Marcus,

I'm sorry to hear that Coral Reef arrived with damage — that's not the experience we want for you, and I understand how disappointing that must be.

We're shipping a replacement today via expedited delivery, and you should receive it within 3-4 business days. No need to return the damaged piece — please feel free to keep or recycle it.

Your replacement will be edition 34 of 50, and it will include a fresh Certificate of Authenticity. If anything else comes up, just reply to this email and I'll take care of it.

Warm regards,
Customer Service
VividWalls Studio
vividwalls.co

```

---

## Template 3: Customer — VIP (High-Value & Repeat)

**Use for:** Repeat buyers, large orders, trade program members, collectors, custom order inquiries
**Tone:** Personal, premium, attentive
**Greeting:** "Hi [First Name],"

### Structure

1. Personal acknowledgment — reference their history or relationship
2. Attentive, detailed response
3. Exclusive touch (early access, custom options, personal recommendations)
4. Warm, personal close

### Example

```

Hi Alexandra,

It's wonderful to hear from you again — I hope the Geometric series is settling in well at the new office.

For your client's feature wall, I'd recommend Intersecting Perspectives no2 at the 53x72 size. It has the presence and visual complexity that holds attention in large spaces, and the color palette — deep navy, warm gold, muted stone — should complement the neutral tones you described.

I can arrange a custom size if 53x72 doesn't quite fit the wall dimensions. Just send me the measurements and I'll have Kingler review the crop to make sure the composition works at that scale.

As part of our trade program, your order qualifies for our designer pricing. I'll send the trade sheet with dimensions, pricing, and lead times separately.

Warm regards,
Customer Service
VividWalls Studio
vividwalls.co

```

---

## Template 4: Trade — Designer (Interior Designers & Stagers)

**Use for:** Interior designers, home stagers, design studios inquiring about trade program, bulk orders, custom specs
**Tone:** Collaborative, specification-ready, professional
**Greeting:** "Hi [First Name],"

### Structure

1. Acknowledge their project or inquiry professionally
2. Relevant collection/piece recommendations with specifications
3. Trade program details (pricing, sizing, lead times)
4. Clear next step (catalog, consultation, quote)

### Example

```

Hi Jennifer,

Thank you for your interest in VividWalls for your residential project — we'd be glad to work with you.

Our Nature and Geometric collections are particularly popular with designers specifying for living spaces. Each piece is available in multiple sizes (up to 53x72 on canvas), and we can accommodate custom dimensions for feature walls.

All pieces are limited editions with a Certificate of Authenticity, printed on gallery-wrapped canvas with archival giclée inks. Production and shipping typically take 7-10 business days through our fulfillment partner in Montreal.

I've attached our trade catalog with the full collection, dimensions, and designer pricing. If you'd like to discuss specific pieces for your project, I'm happy to set up a call or send mockups for the spaces you're working with.

Best regards,
VividWalls Trade Program
vividwalls.co

```

---

## Template 5: Trade — Hospitality (Hotels, Restaurants, Corporate)

**Use for:** Hotel procurement, restaurant owners, corporate facilities, large-format inquiries
**Tone:** Authoritative, ROI-aware, partnership-oriented
**Greeting:** "Dear [Title] [Last Name]," (first contact) or "Hi [First Name]," (established)

### Structure

1. Acknowledge their venue or project
2. Relevant portfolio with hospitality-specific value props (durability, brand story, guest experience)
3. Specification details (large format, multi-piece programs)
4. Next step (consultation, portfolio review, site visit)

### Example

```

Dear Ms. Chen,

Thank you for reaching out about art for the lobby renovation at The Langford. We've worked with boutique hotels looking to define their guest experience through original art, and I'd be glad to explore how VividWalls could complement your design vision.

Our large-format canvas pieces (up to 53x72) are printed with archival inks on gallery-wrapped canvas — designed for durability in high-traffic environments while maintaining gallery-quality color depth. Each edition is limited and comes with a Certificate of Authenticity, which adds a curated, story-rich element for guests.

I'd recommend reviewing our Abstract and Nature collections for lobby and corridor placements. For a property like The Langford, we can also curate a multi-piece program with cohesive color and thematic threading across spaces.

Would you be open to a brief call this week to discuss the project scope? I can prepare a tailored portfolio and pricing proposal.

Best regards,
VividWalls Commercial Partnerships
vividwalls.co

```

---

## Template 6: Supplier — Professional (Pictorem, Vendors, Logistics)

**Use for:** Fulfillment partner communications, shipping carrier inquiries, vendor negotiations, supply chain matters
**Tone:** Concise, professional, precise — reference order numbers and specifics
**Greeting:** "Hi [First Name],"

### Structure

1. State the purpose clearly (no small talk)
2. Reference specific order numbers, dates, or issues
3. Clear ask or information
4. Next step with timeline

### Example

```

Hi Marc,

Following up on order batch VW-2026-0412 submitted on April 3rd.

Three of the twelve pieces in this batch are showing "In Production" status but haven't moved to "Shipped" in the expected timeframe. The affected SKUs are VW-ABS-012 (36x48), VW-GEO-008 (24x36), and VW-NAT-015 (53x72).

Could you confirm the expected ship date for these three pieces? The customer delivery window closes April 12th and we'd like to ensure we can meet our commitment.

Thank you,
Operations
VividWalls Studio
vividwalls.co

```

---

## Template 7: SaaS/Platform — Technical

**Use for:** Shopify support, Stripe inquiries, tech platform issues, integration questions
**Tone:** Direct, reference-focused — include account IDs, ticket numbers, technical specifics
**Greeting:** "Hi [Name/Team],"

### Structure

1. Reference the issue or ticket
2. Technical specifics (error codes, timestamps, account IDs)
3. What we've tried or observed
4. Clear ask

### Example

```

Hi Shopify Support,

Re: Ticket #SHP-2026-04-1234
Store: vividwalls.myshopify.com

We're seeing intermittent webhook delivery failures for the orders/create topic since April 2nd. Approximately 15% of order webhooks are returning 504 timeout errors on our endpoint. Our endpoint response time is consistently under 500ms based on our logs.

We've verified our endpoint is healthy and accepting connections. Could you check if there's a delivery infrastructure issue on your end, or if our webhook subscription needs to be refreshed?

Thank you,
VividWalls Technical Operations
vividwalls.co

```

---

## Template 8: Financial

**Use for:** Invoice responses, billing inquiries, payment confirmations, tax document requests
**Tone:** Precise, factual — reference invoice numbers and amounts
**Greeting:** "Dear [Name],"

### Structure

1. Reference the financial document or matter
2. Factual response with specific numbers
3. Supporting documentation if applicable
4. Clear next step

### Example

```

Dear Patricia,

Thank you for sending invoice #PIC-2026-0398 for $2,847.50 covering the March production batch.

We've reviewed the line items and they match our records. Payment will be processed via our standard net-30 terms, with the transfer scheduled for April 28th.

If you need any adjustments to the remittance details, please let us know before April 25th.

Best regards,
VividWalls Finance
vividwalls.co

```

---

## Template 9: Legal

**Use for:** Contract responses, compliance inquiries, terms of service, IP matters
**Tone:** Formal, careful — do not make commitments, route to Legal agent for review
**Greeting:** "Dear [Title] [Last Name],"

### Structure

1. Acknowledge receipt formally
2. Confirm the matter is under review (do NOT make commitments)
3. Timeline for response
4. Point of contact

### Example

```

Dear Mr. Rivera,

Thank you for sending the updated licensing agreement for our review.

We've received the document and our team is reviewing the terms. We'll provide our response with any requested amendments by end of business April 11th.

If you have any questions in the meantime, please don't hesitate to reach out.

Regards,
VividWalls Legal
vividwalls.co

```

---

## Template 10: FYI Acknowledge (Internal Use)

**Use for:** Newsletters, automated notifications, marketing emails, informational messages that require no external response. This template is for internal logging only — no email is sent.

### Structure

Log the email classification:
- Sender
- Subject
- Classification: FYI Only
- Action: None required
- Routed to: [agent if relevant] or N/A

---

## Template Selection Guide

| Sender Type | Indicators | Template |
|-------------|-----------|----------|
| DTC Customer (general) | @gmail, @yahoo, @outlook, personal domains, product questions | customer-warm |
| DTC Customer (issue) | Words: damaged, wrong, late, missing, refund, return, complaint | customer-resolution |
| Repeat/VIP Customer | Previous order history, trade program member, large order | customer-vip |
| Interior Designer | Design firm domain, mentions "client", "project", "spec" | trade-designer |
| Hotel/Restaurant/Corporate | Hospitality domain, mentions "lobby", "venue", "office" | trade-hospitality |
| Supplier (Pictorem) | @pictorem.com, order references, production status | supplier |
| SaaS Platform | @shopify.com, @stripe.com, support ticket references | saas-platform |
| Financial | Invoice attached, payment reference, billing inquiry | financial |
| Legal | Contract attached, compliance language, legal firm domain | legal |
| Newsletter/Marketing | Unsubscribe link, bulk sender, no personal address | fyi-acknowledge |
```

**Step 2: Verify**

Run: `wc -l extensions/mabos/extensions-mabos/docs/vividwalls/email-templates.md`
Expected: File exists with content

**Step 3: Commit**

```bash
scripts/committer "feat(mabos): add VividWalls email response templates for 10 audience types" extensions/mabos/extensions-mabos/docs/vividwalls/email-templates.md
```

---

### Task 8: Create Email Triage Cron Jobs

**Files:**

- Create: `extensions/mabos/extensions-mabos/templates/base/cron/email-triage-cron-jobs.json`

**Step 1: Create the cron jobs configuration**

This file defines three cron jobs:

1. **Email triage** — every 15 minutes, check and classify unread emails
2. **Pending response follow-up** — every 6 hours, check for stale "Pending Response" emails
3. **Daily email digest** — once daily, summarize email activity to COO and stakeholder

```json
[
  {
    "id": "email-triage-15min",
    "name": "Email Inbox Triage (Every 15 Minutes)",
    "schedule": "*/15 * * * *",
    "timezone": "America/New_York",
    "agentId": "customer-service",
    "enabled": true,
    "timeoutSeconds": 300,
    "message": "Check the VividWalls inbox (kingler@vividwalls.co) for unread emails. For each unread email:\n\n1. Read the email content\n2. Classify the sender type using these rules:\n   - Customer (B2C): personal email domains (@gmail, @yahoo, @outlook, etc.), product/order questions\n   - Supplier: @pictorem.com, vendor domains, fulfillment/logistics content\n   - SaaS/Platform: @shopify.com, @stripe.com, tech platform domains, automated notifications\n   - B2B/Trade: design firm domains, mentions of 'client', 'project', 'spec', 'trade'\n   - Financial: invoice attached, payment references, billing, tax\n   - Legal: contract attached, compliance language, legal firm domains\n   - Marketing/Newsletter: unsubscribe links, bulk sender indicators\n   - Strategic/Executive: partnership proposals, high-value inquiries\n\n3. Apply the appropriate folder:\n   - Customer inquiries/product questions -> 'Customer Inquiries'\n   - Order status/tracking/delivery -> 'Orders & Shipping'\n   - Returns/refunds/exchanges -> 'Returns & Refunds'\n   - Interior designers/hotels/restaurants/corporate -> 'Corporate & B2B'\n   - Pictorem/vendor/logistics -> 'Supplier & Vendors'\n   - Shopify/Stripe/tech platforms -> 'SaaS & Platform'\n   - Invoices/billing/tax -> 'Finance & Billing'\n   - Contracts/compliance/TOS -> 'Legal & Compliance'\n   - Newsletters/marketing -> 'Newsletters & Marketing'\n\n4. Apply categories:\n   - Always add 'Auto-Routed'\n   - Add 'Urgent' if the email contains words like 'urgent', 'asap', 'immediately', 'critical', 'emergency'\n   - Add 'Action Required' if a response is needed from us\n   - Add 'FYI Only' if informational with no response needed\n   - Add 'New Customer' if no prior email history from this sender\n   - Add 'VIP' if sender is a known repeat buyer, trade partner, or corporate contact\n   - Add 'Supplier' if from Pictorem or a vendor\n   - Add 'SaaS Notification' if from a tech platform\n   - Add 'Invoice/Payment' if financial document referenced\n\n5. Route to the appropriate department agent via agent_message:\n   - Customer emails (inquiries, orders, returns): Handle directly — draft a response using the appropriate VividWalls email template (see docs/vividwalls/email-templates.md)\n   - Supplier emails: Route to COO with summary and priority\n   - SaaS/Platform emails: Route to CTO with summary\n   - Financial emails: Route to CFO with summary\n   - Legal emails: Route to Legal with summary\n   - Marketing emails: Route to CMO with summary\n   - B2B/Trade emails: Route to CMO with summary, cc CEO if high-value\n   - Strategic/Executive emails: Route to CEO with summary\n\n6. For URGENT or VIP emails: Send a high-priority agent_message to COO and CEO immediately with subject, sender, and brief summary.\n\n7. For customer emails requiring a response: Draft the response following VividWalls voice and tone guidelines. Use the template selection guide from email-templates.md. Send the draft via the email reply action.\n\nReport: At the end of the cycle, summarize what was processed (count by category, any urgent items, any responses sent).",
    "delivery": {
      "mode": "none"
    }
  },
  {
    "id": "email-pending-followup",
    "name": "Pending Response Follow-Up (Every 6 Hours)",
    "schedule": "0 */6 * * *",
    "timezone": "America/New_York",
    "agentId": "customer-service",
    "enabled": true,
    "timeoutSeconds": 180,
    "message": "Check for emails that have been categorized as 'Pending Response' or 'Action Required' and have not been resolved.\n\n1. List emails with category 'Pending Response' that are older than 24 hours\n2. List emails with category 'Action Required' that are older than 12 hours\n3. For each stale email:\n   a. Check if a response has been sent (search for replies in the thread)\n   b. If no response sent and it's a customer email: Draft and send a follow-up response acknowledging the delay\n   c. If no response sent and it's routed to another agent: Send a reminder agent_message to that agent with high priority\n   d. If a response was sent: Re-categorize as 'Resolved' and remove 'Pending Response'\n4. For emails marked 'Needs Escalation' older than 4 hours: Send urgent agent_message to COO\n5. Report summary of pending items and actions taken.",
    "delivery": {
      "mode": "none"
    }
  },
  {
    "id": "email-daily-digest",
    "name": "Daily Email Activity Digest",
    "schedule": "0 8 * * *",
    "timezone": "America/New_York",
    "agentId": "customer-service",
    "enabled": true,
    "timeoutSeconds": 240,
    "message": "Generate a daily email activity digest for the past 24 hours and report to COO and CEO.\n\n1. List all emails received in the past 24 hours (use filter: receivedDateTime ge [24 hours ago])\n2. Compile statistics:\n   - Total emails received\n   - Breakdown by folder (Customer Inquiries, Orders & Shipping, Returns & Refunds, Corporate & B2B, Supplier & Vendors, SaaS & Platform, Finance & Billing, Legal & Compliance, Newsletters & Marketing)\n   - Count of emails categorized as Urgent\n   - Count of emails still marked 'Pending Response' or 'Action Required'\n   - Count of responses sent by Customer Service\n   - Count of emails routed to other departments\n   - Any VIP or high-value emails received\n3. Highlight items needing attention:\n   - Unresolved urgent emails\n   - Emails pending response for >24 hours\n   - Any escalations that haven't been addressed\n4. Send the digest as an agent_message to COO (priority: normal)\n5. If there are urgent unresolved items, also send to CEO (priority: high)\n6. Send a summary email to kingler@vividwalls.co with subject 'VividWalls Daily Email Digest — [Date]' containing the report in a clean, readable format.",
    "delivery": {
      "mode": "none"
    }
  }
]
```

**Step 2: Verify**

Run: `cat extensions/mabos/extensions-mabos/templates/base/cron/email-triage-cron-jobs.json | jq '.[].id'`
Expected:

```
"email-triage-15min"
"email-pending-followup"
"email-daily-digest"
```

**Step 3: Commit**

```bash
scripts/committer "feat(mabos): add email triage cron jobs (15min triage, 6hr follow-up, daily digest)" extensions/mabos/extensions-mabos/templates/base/cron/email-triage-cron-jobs.json
```

---

### Task 9: Wire Cron Jobs into MABOS Business Initialization

**Files:**

- Explore: `extensions/mabos/extensions-mabos/index.ts` or the business initialization code

**Step 1: Find where cron-jobs.json is populated for businesses**

Run: `grep -rn 'cron-jobs.json' extensions/mabos/extensions-mabos/src/`
Expected: Shows where business cron jobs are loaded/written

**Step 2: Add email cron job loading to business initialization**

The email cron jobs template at `templates/base/cron/email-triage-cron-jobs.json` needs to be merged into the business's `cron-jobs.json` during initialization. The exact modification depends on what Step 1 reveals — look for the function that seeds `cron-jobs.json` when a business is created and add the email triage jobs to it.

If there is an existing cron job array being written, append the three email jobs. If businesses load cron templates from a directory, the file placement in `templates/base/cron/` may be sufficient.

**Step 3: Verify the bridge will pick up the jobs**

Run: `grep -n 'syncAllBusinesses\|cron-jobs.json' extensions/mabos/extensions-mabos/src/cron-bridge.ts | head -20`
Expected: Shows the sync function reads from the business cron-jobs.json

**Step 4: Commit (if modifications needed)**

```bash
scripts/committer "feat(mabos): wire email cron jobs into business initialization" [modified files]
```

---

### Task 10: Create Microsoft Graph Email Folders

**Files:**

- Create: `scripts/setup-email-folders.ts`

**Step 1: Write a one-time setup script to create the new Outlook folders**

The four new folders (Supplier & Vendors, SaaS & Platform, Finance & Billing, Legal & Compliance) need to be created in the actual Outlook mailbox. Write a script using the email-graph-client to create them as Inbox subfolders.

```typescript
// scripts/setup-email-folders.ts
//
// One-time script: creates missing Inbox subfolders in the VividWalls mailbox.
// Run: bun scripts/setup-email-folders.ts

import { listFolders, listChildFolders } from "../src/agents/tools/email-graph-client.js";

// We need a createFolder helper — use graphFetch directly since it's not exported.
// For now, this script documents the Graph API calls needed.

const REQUIRED_SUBFOLDERS = [
  "Customer Inquiries",
  "Orders & Shipping",
  "Returns & Refunds",
  "Corporate & B2B",
  "Supplier & Vendors",
  "SaaS & Platform",
  "Finance & Billing",
  "Legal & Compliance",
  "Newsletters & Marketing",
];

async function main() {
  console.log("Checking existing folders...");
  const topFolders = await listFolders();
  const inbox = topFolders.find((f) => f.displayName.toLowerCase() === "inbox");
  if (!inbox) {
    console.error("Inbox folder not found!");
    process.exit(1);
  }

  const existingChildren = await listChildFolders(inbox.id);
  const existingNames = new Set(existingChildren.map((f) => f.displayName));

  const missing = REQUIRED_SUBFOLDERS.filter((name) => !existingNames.has(name));

  if (missing.length === 0) {
    console.log("All required folders already exist.");
    return;
  }

  console.log(`Creating ${missing.length} missing folders: ${missing.join(", ")}`);

  // Graph API: POST /users/{email}/mailFolders/{inboxId}/childFolders
  // Body: { "displayName": "Folder Name" }
  // This requires adding a createFolder export to email-graph-client.ts

  for (const name of missing) {
    console.log(`  TODO: Create folder "${name}" under Inbox (${inbox.id})`);
    // await createFolder(inbox.id, name);
  }

  console.log("Done. Add createFolder to email-graph-client.ts to make this functional.");
}

main().catch(console.error);
```

**Step 2: Add `createFolder` export to `src/agents/tools/email-graph-client.ts`**

Add after the `listChildFolders` function:

```typescript
export async function createFolder(
  parentFolderId: string,
  displayName: string,
): Promise<GraphFolder> {
  return graphFetch<GraphFolder>(
    `${userPath()}/mailFolders/${encodeURIComponent(parentFolderId)}/childFolders`,
    {
      method: "POST",
      body: JSON.stringify({ displayName }),
    },
  );
}
```

**Step 3: Update the setup script to use the real createFolder**

Replace the TODO loop with:

```typescript
import {
  listFolders,
  listChildFolders,
  createFolder,
} from "../src/agents/tools/email-graph-client.js";

// ... in the loop:
for (const name of missing) {
  console.log(`  Creating folder "${name}"...`);
  const folder = await createFolder(inbox.id, name);
  console.log(`  Created: ${folder.displayName} (${folder.id})`);
}
```

**Step 4: Run the script**

Run: `bun scripts/setup-email-folders.ts`
Expected: Creates the 4 new folders (Supplier & Vendors, SaaS & Platform, Finance & Billing, Legal & Compliance)

**Step 5: Commit**

```bash
scripts/committer "feat(email): add createFolder API and folder setup script" src/agents/tools/email-graph-client.ts scripts/setup-email-folders.ts
```

---

### Task 11: Verify End-to-End

**Step 1: Type-check**

Run: `pnpm build`
Expected: No TypeScript errors

**Step 2: Run tests**

Run: `pnpm test`
Expected: All existing tests pass

**Step 3: Verify agent discovery**

Run: `ls extensions/mabos/extensions-mabos/templates/base/agents/customer-service/`
Expected: All 11 BDI state files present

**Step 4: Verify cron job structure**

Run: `cat extensions/mabos/extensions-mabos/templates/base/cron/email-triage-cron-jobs.json | jq '.[].id'`
Expected: Three job IDs listed

**Step 5: Verify tool filter includes customer-service**

Run: `grep 'customer-service' extensions/mabos/extensions-mabos/src/tools/tool-filter.ts`
Expected: Shows the role entry

**Step 6: Verify directive router includes customer-service**

Run: `grep 'customer-service' extensions/mabos/extensions-mabos/src/tools/directive-router.ts`
Expected: Shows the agent keyword entry

**Step 7: Final commit**

```bash
scripts/committer "feat(mabos): complete email cron + customer-service agent system" [any remaining files]
```
