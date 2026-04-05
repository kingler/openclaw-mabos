---
name: apollo-sales
description: Apollo.io sales prospecting, email finding, contact management, and outreach sequences. Agent: CMO (sales), lead-gen, sales-research, outreach.
metadata:
  agent: cmo
  mcp_server: mcp-apollo
---

# Apollo.io Sales Tools

## Outreach Workflow

1. **Search leads** - `apollo_lead_search` with titles, locations, domains
2. **Reveal emails** - `apollo_email_search` with person IDs from step 1 (costs 1 credit each)
3. **Enrich prospects** - `apollo_prospect_enrich` for full profile data
4. **Save contacts** - `apollo_save_contact` to get Apollo contact IDs
5. **Add to sequence** - `apollo_sequence_manage` with contact IDs
6. **Send emails** - SendGrid handles actual delivery via sequences

## Tools (7)

| Tool                     | Description                                                                               | Credits  |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------- |
| `apollo_lead_search`     | Search people by title, location, domain, size. Set `reveal_emails: true` to auto-reveal. | 1/reveal |
| `apollo_email_search`    | Bulk reveal emails by person IDs, or find email by name+domain/LinkedIn                   | 1/reveal |
| `apollo_prospect_enrich` | Full enrichment: title, company, phone, seniority, LinkedIn                               | 1/match  |
| `apollo_save_contact`    | Save lead as Apollo contact. Returns contact ID for sequences.                            | Free     |
| `apollo_org_search`      | Search companies by domain, location, employee count, revenue                             | Free     |
| `apollo_sequence_manage` | List sequences or add contacts (by contact ID) to a sequence                              | Free     |
| `apollo_contact_lists`   | List all contact lists/labels                                                             | Free     |

## Credit Budget

- Total: 5015 credits
- Used: ~2515
- Remaining: ~2500
- Each email reveal = 1 credit
- Each enrichment = 1 credit

## How to Call (via mcp-cli)

```bash
# Search for marketing directors at e-commerce companies
mcp-cli call mcp-apollo apollo_lead_search '"'"'{"person_titles":["Marketing Director","VP Marketing"],"organization_domains":["shopify.com"],"reveal_emails":true}'"'"'

# Reveal emails for specific person IDs
mcp-cli call mcp-apollo apollo_email_search '"'"'{"person_ids":["abc123","def456"]}'"'"'

# Find email by name + domain
mcp-cli call mcp-apollo apollo_email_search '"'"'{"first_name":"Jane","last_name":"Smith","domain":"shopify.com"}'"'"'

# Save contact for sequence
mcp-cli call mcp-apollo apollo_save_contact '"'"'{"first_name":"Jane","last_name":"Smith","email":"jane@shopify.com","title":"VP Marketing"}'"'"'

# Add contacts to sequence
mcp-cli call mcp-apollo apollo_sequence_manage '"'"'{"action":"add_contacts","sequence_id":"seq_123","contact_ids":["contact_abc"]}'"'"'
```

## Key Rules

- Always `apollo_save_contact` BEFORE `apollo_sequence_manage add_contacts`
- Sequence add requires Apollo contact IDs, not emails
- Budget email reveals carefully (2500 remaining)
- Use `apollo_org_search` first to identify target companies, then `apollo_lead_search` for people
