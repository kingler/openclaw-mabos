---
name: google-analytics
description: Google Analytics 4 reporting, realtime data, audience overview, traffic sources, and top pages.
metadata:
  openclaw:
    emoji: "\U0001F4CA"
    agent: CMO
    mcp_server: mcp-google-analytics
---

# Google Analytics

MCP Server: `mcp-google-analytics` (GA4 Data API)
Property: 478890343

## Tools

### ga4_report

Custom reports with any metrics/dimensions.

- Common metrics: activeUsers, sessions, screenPageViews, conversions, totalRevenue
- Common dimensions: date, pagePath, country, deviceCategory, sessionDefaultChannelGroup
- Dates: YYYY-MM-DD or relative (7daysAgo, 30daysAgo, today)

### ga4_realtime

Live data: active users, current pages, events.

### ga4_audience_overview

Pre-built reports: overview | top_pages | traffic_sources.

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info google-analytics

# Get parameter schema for a specific tool
mcp-cli info google-analytics <tool_name>

# Call a tool
mcp-cli call google-analytics <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call google-analytics ga4_report {...}`
- `mcp-cli call google-analytics ga4_realtime {...}`
- `mcp-cli call google-analytics ga4_audience_overview {...}`
