---
name: stripe-payments
description: Stripe payment reporting, subscription management, balance, payouts, invoices, and customer data.
metadata:
  openclaw:
    emoji: "\U0001F4B3"
    agent: CFO
    mcp_server: mcp-stripe
---

# Stripe Payments

MCP Server: `mcp-stripe` (Stripe API)
Account: acct_1RTycRC8c1ARRUb5

## Tools

### stripe_payment_report

Revenue report for date range: total charges, gross revenue, refunds, net.

### stripe_subscription_manage

- `action`: list | get | cancel
- Cancel sets cancel_at_period_end (grace period)

### stripe_revenue_metrics

- `metric`: balance | payouts | invoices | customers
- Invoice status: draft, open, paid, void

## Notes

- All amounts in cents (divide by 100 for display)
- Uses form-encoded POST (not JSON) per Stripe convention

## How to Call (via mcp-cli)

All tools are invoked via bash using `mcp-cli`:

```bash
# Discover available tools on this server
mcp-cli info stripe

# Get parameter schema for a specific tool
mcp-cli info stripe <tool_name>

# Call a tool
mcp-cli call stripe <tool_name> '{"param": "value"}'
```

### Quick Reference

- `mcp-cli call stripe stripe_payment_report {...}`
- `mcp-cli call stripe stripe_subscription_manage {...}`
- `mcp-cli call stripe stripe_revenue_metrics {...}`
