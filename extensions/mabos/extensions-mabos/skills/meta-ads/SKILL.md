---
name: meta-ads
description: Meta Ads campaign management and analytics. Create/pause/activate campaigns, get performance reports.
metadata:
  openclaw:
    emoji: "\U0001F4B0"
    agent: CMO
    mcp_server: mcp-meta-ads
---

# Meta Ads

MCP Server: `mcp-meta-ads` (Meta Marketing API v22.0)
Account: act_777751590847461

## Tools

### meta_ad_analytics

Campaign performance reports.

- `campaign_id`: Specific campaign (omit for all)
- `date_from` / `date_to`: YYYY-MM-DD

### meta_campaign_manage

CRUD operations on campaigns.

- `action`: list | create | update | pause | activate
- Objectives: OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES
- Budget in cents (e.g., 1000 = $10/day)

### meta_audience_targeting

Browse targeting options (interests, behaviors).

### meta_ad_account_info

Account status, currency, timezone, spend, balance.

## Notes

- Account ID format: act_XXXX
- Budgets are in cents (divide by 100 for display)
- New campaigns default to PAUSED status

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info meta-ads

# Get parameter schema for a specific tool
mcp-cli info meta-ads <tool_name>

# Call a tool
mcp-cli call meta-ads <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call meta-ads meta_ad_analytics {...}`
- `mcp-cli call meta-ads meta_campaign_manage {...}`
- `mcp-cli call meta-ads meta_audience_targeting {...}`
- `mcp-cli call meta-ads meta_ad_account_info {...}`
