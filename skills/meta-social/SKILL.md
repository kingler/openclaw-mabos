---
name: meta-social
description: "Meta platform social media publishing (Facebook + Instagram): content posting, scheduling, token management, ad campaigns, and engagement tracking for VividWalls. Use when: (1) publishing content to Facebook or Instagram, (2) scheduling social media posts, (3) troubleshooting Meta API errors or token issues, (4) planning cross-platform content strategy, (5) managing Meta ad campaigns or audiences, (6) checking engagement metrics."
---

# Meta Social (Facebook + Instagram)

## Overview

Unified social media publishing and advertising pipeline for VividWalls across Meta platforms (Facebook Page + Instagram Business).

**Platforms:**

- **Facebook Page:** VividWalls (ID: `133159026536737`)
- **Instagram Business:** @vividwalls (ID: `17841461891805046`)
- **Meta Ad Account:** `777751590847461`
- **Meta App:** vivid_mas (ID: `1043439837544028`)

**Tools:** `content_publish`, `ad_campaign_create`, `ad_campaign_manage`, `ad_analytics`, `audience_create`
**Config:** `marketing.json` in workspace (`~/.openclaw/workspace/businesses/vividwalls/marketing.json`)

## Token Architecture

Meta uses a two-tier token system. Getting this wrong causes Error #200 (insufficient permissions).

| Token Type            | Purpose                                        | Where Stored                             |
| --------------------- | ---------------------------------------------- | ---------------------------------------- |
| **Page Access Token** | Post to Facebook Page, read page insights      | `platforms.meta.access_token`            |
| **System User Token** | Admin API calls, ad management, token exchange | `platforms.meta.extra.system_user_token` |

### Critical Rule

> **Always use the Page Access Token for posting.** The System User token cannot post to pages directly — it must be exchanged for a Page Access Token first.

### Token Exchange (if Page Token expires or needs refresh)

```
GET https://graph.facebook.com/v21.0/{page_id}?fields=access_token&access_token={system_user_token}
```

This returns a Page Access Token that inherits the System User's permissions. The Page Token is what goes into `platforms.meta.access_token`.

### Token Permissions Required

| Permission                  | Level    | Purpose                              |
| --------------------------- | -------- | ------------------------------------ |
| `pages_read_engagement`     | Standard | Read page posts, comments, reactions |
| `pages_manage_posts`        | Standard | Create/edit/delete page posts        |
| `pages_read_user_content`   | Standard | Read user posts on page              |
| `instagram_basic`           | Standard | Read IG profile and media            |
| `instagram_content_publish` | Standard | Publish IG posts, reels, stories     |
| `ads_management`            | Standard | Create and manage ad campaigns       |
| `ads_read`                  | Standard | Read ad performance metrics          |
| `business_management`       | Standard | Manage business assets               |

### Token Regeneration

1. Go to Meta Business Suite → Settings → System Users → MABOS
2. Click "Generate new token" with vivid_mas app selected
3. Select all required permissions above
4. Set expiration to "Never"
5. Exchange for Page Access Token via the GET call above
6. Update `marketing.json` with both tokens

## Quick Reference

### Publishing

```
# Facebook text post
content_publish(platforms: ["facebook"], content_type: "text", text: "...")

# Facebook image post
content_publish(platforms: ["facebook"], content_type: "image", text: "...", media_url: "https://...")

# Instagram image post (requires public media URL)
content_publish(platforms: ["instagram"], content_type: "image", text: "...", media_url: "https://...")

# Instagram reel
content_publish(platforms: ["instagram"], content_type: "reel", text: "...", media_url: "https://...")

# Cross-post to both
content_publish(platforms: ["facebook", "instagram"], content_type: "image", text: "...", media_url: "https://...")

# Schedule a post (Unix timestamp)
content_publish(platforms: ["facebook"], content_type: "text", text: "...", scheduled_time: 1741968000)
```

### Ad Campaigns

```
# Create campaign
ad_campaign_create(platform: "meta", name: "...", objective: "TRAFFIC", daily_budget: 15, ...)

# Check performance
ad_analytics(platform: "meta", campaign_id: "...", metrics: ["impressions", "clicks", "spend", "ctr"])
```

## Decision Framework

### Platform Selection

| Content Type                    | Facebook | Instagram | Both      |
| ------------------------------- | -------- | --------- | --------- |
| Product showcase (single image) | Yes      | Yes       | Preferred |
| Collection launch (carousel)    | Yes      | Yes       | Preferred |
| Behind-the-scenes / process     | No       | Yes       | -         |
| Blog/article link               | Yes      | No        | -         |
| Reel / short video              | Optional | Yes       | -         |
| Time-sensitive promotion        | Yes      | Yes       | Preferred |
| B2B / corporate messaging       | Yes      | No        | -         |
| Lifestyle / inspiration         | No       | Yes       | -         |

### Posting Cadence

| Platform          | Frequency | Best Times (EST)           |
| ----------------- | --------- | -------------------------- |
| Facebook          | 3-5x/week | Tue-Thu 9am-12pm, Fri 10am |
| Instagram         | 5-7x/week | Mon-Fri 11am-1pm, Thu 7pm  |
| Instagram Stories | Daily     | 8am-9am, 12pm, 6pm         |
| Instagram Reels   | 2-3x/week | Tue, Thu, Sat 10am-12pm    |

### Content by Segment

| Segment     | Tone                  | Focus                           | CTA                     |
| ----------- | --------------------- | ------------------------------- | ----------------------- |
| Homeowner   | Warm, aspirational    | Room transformations, lifestyle | "Shop the collection"   |
| Designer    | Professional, curated | Materials, customization, specs | "Request trade pricing" |
| Hospitality | Premium, ROI-focused  | Guest experience, ambiance      | "Book a consultation"   |

## Troubleshooting

### Common Errors

| Error                             | Cause                                                | Fix                                                           |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `#200 — insufficient permissions` | Using System User token instead of Page Access Token | Exchange for Page Token (see Token Exchange above)            |
| `#200 — permissions missing`      | App lacks `pages_manage_posts`                       | Check Meta Developer Console → App Review → Permissions       |
| `#100 — invalid parameter`        | Media URL not publicly accessible (Instagram)        | Use a public CDN URL, not localhost or private                |
| `#36003 — media not ready`        | Instagram container still processing                 | Wait 5-10s and retry `media_publish`                          |
| `#4 — rate limit`                 | Too many API calls                                   | Wait 60s, reduce posting frequency                            |
| `#10 — permission denied`         | Page not assigned to System User                     | Meta Business Suite → System Users → Assign Assets → Add Page |
| Token expired                     | System User token rotated                            | Regenerate token (see Token Regeneration above)               |

### Diagnostic Steps

1. **Verify token:** `GET /me?access_token={token}` — should return page name for Page Token
2. **Check permissions:** `GET /me/permissions?access_token={token}` — list granted permissions
3. **Test post:** `content_publish` with simple text to Facebook
4. **Check config:** Ensure `marketing.json` has `platforms.meta.access_token` set to Page Token (not System User token)

## Instagram-Specific Notes

### Two-Step Publishing

Instagram requires a container-based flow (unlike Facebook's direct posting):

1. **Create container:** `POST /{ig_id}/media` with `image_url` + `caption`
2. **Wait for processing** (1-5 seconds for images, 30-60s for video)
3. **Publish:** `POST /{ig_id}/media_publish` with `creation_id`

The `content_publish` tool handles this automatically, but if you see `#36003` errors, increase the wait time between steps.

### Media Requirements

| Type       | Format         | Max Size     | Aspect Ratio                        |
| ---------- | -------------- | ------------ | ----------------------------------- |
| Feed image | JPEG, PNG      | 8MB          | 1:1 (square preferred), 4:5, 1.91:1 |
| Story      | JPEG, PNG, MP4 | 30MB (video) | 9:16                                |
| Reel       | MP4            | 1GB          | 9:16, 3-90 seconds                  |
| Carousel   | JPEG, PNG      | 8MB each     | Consistent across all items         |

### Hashtag Strategy

Include in `text` field. Recommended structure:

- 3-5 brand hashtags: `#VividWalls #WallArt #ArtThatInspires`
- 3-5 niche hashtags based on segment
- Keep total under 20 (Instagram penalizes hashtag stuffing)

## Integration Points

### Upstream: Content Calendar

- Content calendar entries in `marketing.json` drive posting schedule
- CMO agent plans content, outreach agent may use for social selling

### Downstream: Analytics

- Post engagement feeds back into content strategy optimization
- Ad campaign metrics inform budget allocation decisions
- Segment-specific performance guides persona targeting

### Cross-Agent Coordination

- **CMO** → Plans content strategy, approves ad budgets
- **Outreach** → Uses Instagram DMs for prospect engagement (requires `outreach` approval gate)
- **Lead Gen** → Social engagement signals feed prospect qualification

## Guardrails

- **Rate Limits:** Meta allows 200 API calls/user/hour. Space batch operations.
- **Posting Frequency:** Max 2 Facebook posts/day, 3 Instagram posts/day to avoid algorithmic penalty.
- **Ad Spend:** Daily budget cap enforced in `ad_campaign_create`. CMO approval required for budgets > $50/day.
- **DM Outreach:** Instagram DMs to new contacts require Telegram approval gate (type: `"outreach"`).
- **Content Review:** First-time post formats (reels, carousels) should be reviewed before publishing.
- **Token Security:** Never log or expose tokens. Page Access Token is stored only in `marketing.json`.
- **Compliance:** All posts must comply with Meta's Commerce and Advertising policies. No misleading claims about art origin or pricing.
