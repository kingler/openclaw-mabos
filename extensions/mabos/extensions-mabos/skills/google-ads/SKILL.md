---
name: google-ads
description: Google Ads campaign reports, keyword performance, and campaign listing via GAQL queries.
metadata:
  openclaw:
    emoji: "\U0001F4B5"
    agent: CMO
    mcp_server: mcp-google-ads
---

# Google Ads

MCP Server: `mcp-google-ads` (Google Ads API v18)

## Tools

### google_ads_campaign_report

Campaign performance with impressions, clicks, cost, CTR, CPC, conversions.

### google_ads_keyword_performance

Keyword-level metrics including impression share.

### google_ads_list_campaigns

List campaigns with budget and status. Filter: ENABLED, PAUSED, REMOVED.

## Notes

- Uses GAQL (Google Ads Query Language) internally
- Cost values in micros (divide by 1,000,000 for dollars)
- Requires developer-token + OAuth access token

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info google-ads

# Get parameter schema for a specific tool
mcp-cli info google-ads <tool_name>

# Call a tool
mcp-cli call google-ads <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call google-ads google_ads_campaign_report {...}`
- `mcp-cli call google-ads google_ads_keyword_performance {...}`
- `mcp-cli call google-ads google_ads_list_campaigns {...}`
