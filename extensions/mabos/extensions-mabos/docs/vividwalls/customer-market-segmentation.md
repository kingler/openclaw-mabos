---
summary: "VividWalls Studio customer market segmentation — 6 segments across DTC and B2B"
read_when:
  - Planning marketing campaigns or ad targeting
  - Configuring lead scoring or CRM pipeline stages
  - Building outreach sequences for B2B segments
  - Prioritizing product or feature launches
  - Generating content or copy for specific audiences
  - Reviewing campaign ROI by segment
title: "Customer Market Segmentation"
---

# VividWalls Studio — Customer Market Segmentation

## Overview

VividWalls is a pre-launch canvas print e-commerce studio on Shopify, selling
original artwork created by Kingler Bercy (founding artist & principal
stakeholder). All products are fulfilled print-on-demand via Pictorem
(Montreal, QC) through the Payment Bridge (port 3001). The catalog spans 6
categories (Abstract, Minimalist, Nature, Geometric, Portrait, Custom) priced
$49–$349. Zero real sales to date — the segmentation below reflects strategic
intent derived from planned campaigns, segment-specific banner investments, and
B2B prospecting tooling.

---

## Segment 1: DTC Home Decor Consumer

The primary volume segment. Individual buyers purchasing wall art for personal
living spaces.

**Profile:** Homeowners, renters, and apartment dwellers aged 25–45 who
actively invest in home aesthetics. Skews toward urban/suburban, design-aware
but not professional designers. Discovers art through social media browsing and
home decor inspiration boards.

**Buying behavior:** Single-piece purchases. Price-sensitive in the $59–$169
range (Minimalist and Abstract categories). Impulse-driven by visual appeal.
Gift purchasing is a seasonal overlay (Valentine's Day, holidays,
housewarming).

**Channels:** Meta Ads, Instagram, Pinterest, Email welcome series

**Planned campaigns:**

- "Launch Campaign — Home Decor DTC"
- "Pinterest Wall Art Discovery"
- "Email Welcome Series"

**KPI targets:** 3.5% conversion rate, $120 AOV, 3,000 email subscribers

---

## Segment 2: Interior Designers & Home Stagers

Professional trade buyers sourcing art for client projects. Higher AOV, repeat
purchasing, relationship-driven.

**Profile:** Independent interior designers, home staging firms, design
studios. Specifying art for residential renovations, new builds, and property
staging. Companies like the prospective partners in the seed: The Artisan
Gallery, Design Collective Network.

**Buying behavior:** Multi-piece orders for client projects. Selects statement
pieces in the $109–$249 range (Geometric, Nature, Portrait). Values curation,
consistent quality, and the ability to specify sizes. Potential for
trade/wholesale pricing program.

**Channels:** Email outreach, LinkedIn, Instagram (professional discovery)

**Planned campaign:** "B2B Interior Design Outreach" — trade program signups
and bulk orders

**Segment banner:** Interior design showroom — "aspirational editorial,
Architectural Digest quality" — featuring Intersecting Perspectives no2
artwork on a gallery wall in a museum-quality residential space

---

## Segment 3: Hospitality — Hotels & Resorts

Boutique hotels and hospitality groups purchasing art to define guest
experience and brand identity.

**Profile:** Hotel owners, hospitality design firms, property management
groups. Think boutique/lifestyle hotels (Aman, Edition, Ace Hotel aesthetic).
Purchasing decisions made by ownership, design consultants, or procurement.

**Buying behavior:** Large-format pieces (53x72 canvas). Multi-piece orders
across lobby, corridors, rooms. Long sales cycle, relationship-driven. Values
durability, brand alignment, and the story behind the art.

**Channels:** Email, LinkedIn, direct outreach (Apollo/Google Maps prospecting
via lead-gen tools)

**Segment banner:** Luxury hotel lobby — "arrive and exhale" — featuring
Echoes artwork in a warm, layered hospitality environment with velvet seating
and brass fixtures

---

## Segment 4: Restaurants & Bars

Upscale food and beverage venues purchasing art as atmosphere and identity.

**Profile:** Restaurant owners, bar operators, hospitality design consultants.
Design-forward venues where the interior is part of the brand — "the piece
everyone asks about."

**Buying behavior:** Dramatic statement pieces that complement moody,
atmospheric interiors. Favors bold, high-contrast artwork (Abstract, Portrait
categories). 1–3 pieces per venue. Mid-to-high price range ($149–$259).

**Channels:** Email, LinkedIn, Google Maps prospecting (lead-gen tools target
local businesses)

**Segment banner:** Upscale restaurant/bar — "dramatic, intimate,
design-forward" — featuring Fractal Double Red artwork against concrete and
warm timber

---

## Segment 5: Commercial Offices & Coworking

Corporate lobbies, coworking spaces, and professional environments purchasing
art as brand statement.

**Profile:** Tech companies, startups, coworking operators, corporate real
estate. Art signals culture, values, and investment in environment. Purchasing
decisions by office managers, founders, or facilities teams.

**Buying behavior:** Clean, professional pieces (Geometric, Minimalist
categories). Multi-piece orders for lobbies, conference rooms, common areas.
Budget often comes from facilities/operations, not marketing. Values
professionalism and brand alignment.

**Channels:** Email, LinkedIn, Google Ads

**Planned campaign:** "B2B Hospitality & Commercial" (covers segments 3–5)

**Segment banner:** Corporate lobby — "Fortune 500 headquarters — confident,
substantial, tasteful" — featuring Parallelogram Chrome no4 artwork in a
polished stone lobby

---

## Segment 6: Custom Art Buyers (Emerging)

Buyers who want bespoke pieces. Not yet launched — 5 Custom SKUs in draft
($49–$349).

**Profile:** Cuts across all segments. DTC consumers wanting personalized art
for a specific room. Designers needing pieces that match a client's exact
palette. B2B buyers wanting branded or site-specific artwork.

**Products:**

| SKU        | Product             | Price |
| ---------- | ------------------- | ----- |
| VW-CUS-001 | Custom Canvas 24x36 | $299  |
| VW-CUS-002 | Custom Canvas 18x24 | $249  |
| VW-CUS-003 | Custom Print 12x16  | $149  |
| VW-CUS-004 | Custom Metal 20x30  | $349  |
| VW-CUS-005 | Custom Poster 16x20 | $49   |

**Status:** Draft. Will activate once the custom order workflow and Pictorem
submission pipeline are validated.

---

## Segment Priority Matrix

| Segment            | Volume  | AOV          | Sales Cycle | Launch Priority       |
| ------------------ | ------- | ------------ | ----------- | --------------------- |
| DTC Home Decor     | High    | $100–$170    | Immediate   | **1 — Launch driver** |
| Interior Designers | Medium  | $300–$500+   | 2–4 weeks   | **2 — Early B2B**     |
| Hospitality        | Low     | $500–$2,000+ | 1–3 months  | 3 — Pipeline build    |
| Restaurant & Bar   | Low-Med | $300–$800    | 2–6 weeks   | 4 — Pipeline build    |
| Commercial Office  | Low     | $400–$1,500+ | 1–3 months  | 5 — Pipeline build    |
| Custom Art         | TBD     | $49–$349     | Varies      | 6 — Post-launch       |

## Strategic Takeaway

DTC is the launch engine (volume, fast feedback loop, social proof). Interior
Designers are the early B2B bridge (smaller deals, faster close than
hospitality/commercial). Hospitality, Restaurant, and Commercial are
pipeline-build segments where the segment banners and lead-gen tools are
already positioned for outreach once the brand has traction and proof points.

## Tooling Alignment

- **Lead scoring** (`crm_lead_scoring`): Configurable weights per segment —
  engagement, company size, industry match, budget, recency
- **Prospecting** (`apollo_prospecting`, `gmaps_prospecting`,
  `linkedin_enrichment`): Feed Designer and B2B segments
- **Campaigns** (`erp.campaigns`): 6 planned campaigns mapped to segments 1–5
- **Segment banners**: 4 professional banners (Interior Design, Hotel,
  Restaurant, Commercial Office) in
  `extensions/mabos/assets/hero-banners/segment-banner-*.png`
