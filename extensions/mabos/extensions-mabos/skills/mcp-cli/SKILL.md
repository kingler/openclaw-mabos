---
name: mcp-cli
description: Interface for MCP servers via CLI. Dynamic tool discovery reduces context by 99%. Use when interacting with external platforms (social media, ads, email, payments, sales).
metadata:
  openclaw:
    emoji: "\U0001F50C"
    agent: all
---

# MCP-CLI

Access 10 platform MCP servers through the command line. Discover tools on demand instead of loading all schemas upfront.

## Commands

| Command                                 | Output                           |
| --------------------------------------- | -------------------------------- |
| `mcp-cli`                               | List all servers and tools       |
| `mcp-cli info <server>`                 | Show server tools and parameters |
| `mcp-cli info <server> <tool>`          | Get tool JSON schema             |
| `mcp-cli grep "<pattern>"`              | Search tools by name             |
| `mcp-cli call <server> <tool> '<json>'` | Call tool with arguments         |

**Both formats work:** `<server> <tool>` or `<server>/<tool>`

## Workflow

1. **Discover**: `mcp-cli` or `mcp-cli grep "pattern"`
2. **Inspect**: `mcp-cli info <server> <tool>` to get parameter schema
3. **Execute**: `mcp-cli call <server> <tool> '{"key":"val"}'`

## Available Servers

| Server             | Agent | Purpose                                            |
| ------------------ | ----- | -------------------------------------------------- |
| `facebook`         | CMO   | Page insights, post publishing, page management    |
| `instagram`        | CMO   | IG insights, media publish, story analytics        |
| `meta-ads`         | CMO   | Ad analytics, campaign CRUD, audience targeting    |
| `pinterest`        | CMO   | Pin analytics, pin creation, board management      |
| `tiktok`           | CMO   | Ad analytics, campaign management, video library   |
| `sendgrid`         | CMO   | Email sending, campaign stats, templates, contacts |
| `google-analytics` | CMO   | GA4 reports, realtime data, audience overview      |
| `google-ads`       | CMO   | Campaign reports, keyword performance              |
| `stripe`           | CFO   | Payment reports, subscriptions, revenue metrics    |
| `apollo`           | CMO   | Lead search, prospect enrichment, email sequences  |

## Examples

```bash
# List all servers and tools
mcp-cli

# Get Instagram insights
mcp-cli call instagram ig_insights '{"metric_type":"overview","date_from":"2026-03-01","date_to":"2026-03-26"}'

# Search leads on Apollo
mcp-cli call apollo apollo_lead_search '{"person_titles":["CEO"],"employee_ranges":["1,50"]}'

# Get Stripe revenue
mcp-cli call stripe stripe_payment_report '{"date_from":"2026-03-01","date_to":"2026-03-26"}'

# GA4 audience overview
mcp-cli call google-analytics ga4_audience_overview '{"date_from":"7daysAgo","date_to":"today"}'

# List Meta Ads campaigns
mcp-cli call meta-ads meta_campaign_manage '{"action":"list"}'

# Find all analytics tools
mcp-cli grep "*analytics*"

# Chain: search then act
mcp-cli grep "campaign" | head -5
mcp-cli call meta-ads meta_campaign_manage '{"action":"list","status_filter":"ACTIVE"}'

# Multi-platform report
{
  mcp-cli call facebook facebook_page_insights '{"metric_type":"audience","date_from":"2026-03-01","date_to":"2026-03-26"}'
  mcp-cli call instagram ig_insights '{"metric_type":"audience","date_from":"2026-03-01","date_to":"2026-03-26"}'
  mcp-cli call pinterest pinterest_analytics '{"metric_type":"account","date_from":"2026-03-01","date_to":"2026-03-26"}'
}
```

## Exit Codes

- `0`: Success
- `1`: Client error (bad args, missing config)
- `2`: Server error (tool failed)
- `3`: Network error

## Notes

- Connection pooling: 60s idle timeout (MCP_DAEMON_TIMEOUT)
- `call` outputs raw text (pipe-friendly, no jq needed)
- Config: ~/.config/mcp/mcp_servers.json
- Env vars with API keys must be set for servers to start
