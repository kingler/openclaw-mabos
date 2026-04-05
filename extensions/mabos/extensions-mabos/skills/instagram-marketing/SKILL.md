---
name: instagram-marketing
description: Instagram analytics, media publishing (photos/carousels), and story insights via MCP server.
metadata:
  openclaw:
    emoji: "\U0001F4F7"
    agent: CMO
    mcp_server: mcp-instagram
---

# Instagram Marketing

MCP Server: `mcp-instagram` (Meta Graph API v22.0)

## Tools

### ig_insights

Account-level insights with proper metric_type handling.

- overview: `reach,views,follows_and_unfollows`
- audience: `follows_and_unfollows,reach` (metric_type=total_value)
- engagement: `accounts_engaged,total_interactions,likes,comments,shares,saves,replies` (metric_type=total_value)

### ig_media_publish

Publish photos or carousels. Requires public image URLs.

- 1 URL = single photo
- 2-10 URLs = carousel

### ig_story_analytics

Story-level metrics: exits, impressions, reach, replies, taps.

### ig_account_info

Profile data: username, bio, followers, media count.

## Deprecated Metrics (DO NOT USE)

- ~~follower_count~~ -> follows_and_unfollows
- ~~online_followers~~ -> reach
- ~~profile_views~~ -> views

## Notes

- Engagement + audience queries MUST include `metric_type=total_value`
- Caption limit: 2200 chars, 30 hashtags
- Image URLs must be publicly accessible

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info instagram

# Get parameter schema for a specific tool
mcp-cli info instagram <tool_name>

# Call a tool
mcp-cli call instagram <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call instagram ig_insights {...}`
- `mcp-cli call instagram ig_media_publish {...}`
- `mcp-cli call instagram ig_story_analytics {...}`
- `mcp-cli call instagram ig_account_info {...}`
