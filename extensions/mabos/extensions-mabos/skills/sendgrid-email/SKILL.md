---
name: sendgrid-email
description: SendGrid email delivery, campaign stats, template management, and contact list operations.
metadata:
  openclaw:
    emoji: "\U00002709"
    agent: CMO
    mcp_server: mcp-sendgrid
---

# SendGrid Email

MCP Server: `mcp-sendgrid` (SendGrid v3 API)

## Tools

### sendgrid_send_email

Send email via HTML content or dynamic template.

- Supports comma-separated recipients
- Must use verified sender domain

### sendgrid_campaign_stats

Delivery statistics: requests, delivered, opens, clicks, bounces.

### sendgrid_template_manage

List or get details of dynamic templates.

### sendgrid_contact_lists

Manage marketing contacts: list, search (SGQL), manage lists, add contacts.

## Notes

- Status 202 = email accepted for delivery
- Templates are "dynamic" generation
- Search uses SGQL: email LIKE "%@domain.com"

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info sendgrid

# Get parameter schema for a specific tool
mcp-cli info sendgrid <tool_name>

# Call a tool
mcp-cli call sendgrid <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call sendgrid sendgrid_send_email {...}`
- `mcp-cli call sendgrid sendgrid_campaign_stats {...}`
- `mcp-cli call sendgrid sendgrid_template_manage {...}`
- `mcp-cli call sendgrid sendgrid_contact_lists {...}`
