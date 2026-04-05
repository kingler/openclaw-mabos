---
name: facebook-marketing
description: Facebook Page management and analytics via MCP server. Publish posts, get insights, manage page feed.
metadata:
  openclaw:
    emoji: "\U0001F4D8"
    agent: CMO
    mcp_server: mcp-facebook
---

# Facebook Marketing

MCP Server: `mcp-facebook` (Meta Graph API v22.0)

## Tools

### facebook_page_insights

Get page metrics. Uses New Pages Experience fields API (not deprecated Insights).

- `metric_type`: overview | audience | engagement
- `date_from` / `date_to`: YYYY-MM-DD

### facebook_post_publish

Publish or schedule posts.

- `message`: Post text
- `link`: Optional URL
- `scheduled_time`: Unix timestamp (10min-6months future)

### facebook_page_manage

- `action`: info | feed | delete_post
- `post_id`: Required for delete_post

## Valid Metrics

- **Audience**: fan_count, followers_count (via page fields, NOT Insights API)
- **Engagement**: Aggregated from post-level likes, comments, shares
- **Overview**: Combined audience + recent post engagement

## Notes

- Page Insights API is deprecated for New Pages Experience
- All data comes from page fields + post-level aggregation
- Rate limit: 200 calls/user/hour

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info facebook

# Get parameter schema for a specific tool
mcp-cli info facebook <tool_name>

# Call a tool
mcp-cli call facebook <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call facebook facebook_page_insights {...}`
- `mcp-cli call facebook facebook_post_publish {...}`
- `mcp-cli call facebook facebook_page_manage {...}`
