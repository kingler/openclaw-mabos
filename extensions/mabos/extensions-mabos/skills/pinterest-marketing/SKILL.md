---
name: pinterest-marketing
description: Pinterest pin creation, board management, and analytics via MCP server.
metadata:
  openclaw:
    emoji: "\U0001F4CC"
    agent: CMO
    mcp_server: mcp-pinterest
---

# Pinterest Marketing

MCP Server: `mcp-pinterest` (Pinterest API v5)

## Tools

### pinterest_analytics

- `metric_type`: account | pin | ads
- Metrics: IMPRESSION, SAVE, PIN_CLICK, OUTBOUND_CLICK, ENGAGEMENT

### pinterest_pin_create

Create pins with image URL, title, description, optional link.

### pinterest_board_manage

List boards or get pins from a board.

## Notes

- TOTAL_AUDIENCE metric removed (deprecated)
- Pin title max 100 chars, description max 500 chars
- Images must be publicly accessible URLs

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info pinterest

# Get parameter schema for a specific tool
mcp-cli info pinterest <tool_name>

# Call a tool
mcp-cli call pinterest <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call pinterest pinterest_analytics {...}`
- `mcp-cli call pinterest pinterest_pin_create {...}`
- `mcp-cli call pinterest pinterest_board_manage {...}`
