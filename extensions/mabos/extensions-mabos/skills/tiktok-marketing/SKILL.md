---
name: tiktok-marketing
description: TikTok Ads campaign management, performance analytics, and creative library via MCP server.
metadata:
  openclaw:
    emoji: "\U0001F3B5"
    agent: CMO
    mcp_server: mcp-tiktok
---

# TikTok Marketing

MCP Server: `mcp-tiktok` (TikTok Business API v1.3)
Advertiser: 7621162262069477392

## Tools

### tiktok_ad_analytics

Campaign performance: spend, impressions, clicks, CPC, CPM, CTR, conversions.

### tiktok_campaign_manage

- `action`: list | create | enable | disable
- Objectives: TRAFFIC, CONVERSIONS, APP_INSTALL, REACH, VIDEO_VIEWS, LEAD_GENERATION

### tiktok_organic_metrics

- `action`: account_info | video_list

## Notes

- TikTok uses `Access-Token` header (not Bearer)
- Response code 0 = success, non-zero = error
- Budget in USD (not cents)

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info tiktok

# Get parameter schema for a specific tool
mcp-cli info tiktok <tool_name>

# Call a tool
mcp-cli call tiktok <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call tiktok tiktok_ad_analytics {...}`
- `mcp-cli call tiktok tiktok_campaign_manage {...}`
- `mcp-cli call tiktok tiktok_organic_metrics {...}`
