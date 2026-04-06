# VividWalls Brand Guidelines v1.0

> Last updated: 2026-04-05
> Status: Active

## Quick Reference

| Element         | Value                                                     |
| --------------- | --------------------------------------------------------- |
| Primary Color   | #0061FF (Vivid Blue)                                      |
| Secondary Color | #1A1A2E (Deep Navy)                                       |
| Accent Color    | #E94560 (Gallery Rose)                                    |
| Heading Font    | Playfair Display                                          |
| Body Font       | Inter                                                     |
| Voice           | Curated, Confident, Warm                                  |
| Tagline         | "Transform your space with art that speaks to your soul." |

---

## 1. Brand Overview

**VividWalls** is a premium direct-to-consumer art studio specializing in limited-edition wall art and canvas prints. Founded by artist Kingler Bercy, the brand bridges the gap between gallery-quality art and accessible home decor, serving design-conscious consumers and trade professionals alike.

### Brand Promise

Every piece is original, every edition is limited, and every purchase comes with a Certificate of Authenticity. VividWalls exists to make living spaces more expressive, personal, and alive.

### Brand Values

| Value             | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| **Authenticity**  | Original art with provenance — no mass production, no unlimited runs     |
| **Curation**      | Every piece is intentionally created and placed in a cohesive collection |
| **Accessibility** | Gallery-quality art at attainable price points ($49-$349)                |
| **Craftsmanship** | Premium materials — canvas, fine art paper, metal, acrylic               |
| **Expression**    | Art as a vehicle for personal identity and spatial transformation        |

---

## 2. Color Palette

### Primary Colors

| Name       | Hex     | RGB             | Usage                                          |
| ---------- | ------- | --------------- | ---------------------------------------------- |
| Vivid Blue | #0061FF | rgb(0, 97, 255) | CTAs, links, primary brand moments, headers    |
| Deep Navy  | #1A1A2E | rgb(26, 26, 46) | Text, dark backgrounds, sophistication anchors |

### Accent Colors

| Name         | Hex     | RGB                | Usage                                                               |
| ------------ | ------- | ------------------ | ------------------------------------------------------------------- |
| Gallery Rose | #E94560 | rgb(233, 69, 96)   | Highlights, sale badges, emotional emphasis                         |
| Warm Gold    | #C9A96E | rgb(201, 169, 110) | Premium tier badges, Certificate of Authenticity, luxury signifiers |
| Sage         | #7C9A82 | rgb(124, 154, 130) | Nature collection accents, success states, calm moments             |

### Neutral Palette

| Name          | Hex     | RGB                | Usage                                     |
| ------------- | ------- | ------------------ | ----------------------------------------- |
| White         | #FFFFFF | rgb(255, 255, 255) | Page backgrounds, gallery white space     |
| Gallery White | #FAFAF8 | rgb(250, 250, 248) | Card surfaces, product detail backgrounds |
| Warm Gray     | #E8E6E1 | rgb(232, 230, 225) | Borders, dividers, subtle backgrounds     |
| Mid Gray      | #9B9B9B | rgb(155, 155, 155) | Captions, secondary text, metadata        |
| Charcoal      | #333333 | rgb(51, 51, 51)    | Body text on light backgrounds            |

### Semantic Colors

| State   | Hex     | Usage                              |
| ------- | ------- | ---------------------------------- |
| Success | #22C55E | Order confirmed, edition secured   |
| Warning | #F59E0B | Low stock, edition almost sold out |
| Error   | #EF4444 | Payment failed, form errors        |
| Info    | #0061FF | Shipping updates, edition details  |

### Accessibility

- Deep Navy on White: 14.5:1 contrast ratio (AAA)
- Vivid Blue on White: 4.6:1 contrast ratio (AA)
- Gallery Rose on White: 4.1:1 (AA for large text; pair with Deep Navy for body text)
- All interactive elements meet WCAG 2.1 AA standards

### Color Usage Ratios

| Surface                                    | Ratio |
| ------------------------------------------ | ----- |
| White / Gallery White (negative space)     | 60%   |
| Deep Navy + Charcoal (text, structure)     | 25%   |
| Vivid Blue (action, brand)                 | 10%   |
| Gallery Rose + Warm Gold (accent, emotion) | 5%    |

Art should dominate — the brand palette exists to frame it, not compete with it.

---

## 3. Typography

### Font Stack

```css
--font-heading: "Playfair Display", "Georgia", serif;
--font-body: "Inter", system-ui, -apple-system, sans-serif;
--font-accent: "Playfair Display", "Georgia", serif; /* Pull quotes, edition numbers */
--font-mono: "JetBrains Mono", "Fira Code", monospace; /* Edition codes, SKUs */
```

### Type Scale

| Element       | Font             | Weight     | Size (Desktop / Mobile) | Line Height | Letter Spacing |
| ------------- | ---------------- | ---------- | ----------------------- | ----------- | -------------- |
| Display       | Playfair Display | 700        | 64px / 40px             | 1.1         | -0.02em        |
| H1            | Playfair Display | 700        | 48px / 32px             | 1.2         | -0.01em        |
| H2            | Playfair Display | 600        | 36px / 28px             | 1.25        | 0              |
| H3            | Inter            | 600        | 24px / 20px             | 1.3         | 0              |
| H4            | Inter            | 600        | 20px / 18px             | 1.35        | 0.01em         |
| Body          | Inter            | 400        | 16px / 16px             | 1.6         | 0              |
| Body Large    | Inter            | 400        | 18px / 18px             | 1.6         | 0              |
| Small         | Inter            | 400        | 14px / 14px             | 1.5         | 0.01em         |
| Caption       | Inter            | 500        | 12px / 12px             | 1.4         | 0.04em         |
| Edition Label | Playfair Display | 400 Italic | 14px / 14px             | 1.4         | 0.08em         |

### Typography Principles

- **Headings** use Playfair Display for editorial elegance and art-world credibility
- **Body** uses Inter for clean readability across screens
- **Edition numbers and certificates** use Playfair Display italic for a hand-signed quality
- Never set body text in Playfair Display — it is reserved for headlines, pull quotes, and accent moments
- Maintain generous line height (1.5-1.6) in body copy for a gallery-like sense of breathing room

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link
  href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

---

## 4. Logo Usage

### Variants

| Variant                | Use Case                                      |
| ---------------------- | --------------------------------------------- |
| **Full Horizontal**    | Website header, email signatures, documents   |
| **Stacked**            | Square social media avatars, packaging labels |
| **Wordmark Only**      | Minimal contexts, product tags, watermarks    |
| **Monochrome (White)** | Dark backgrounds, overlays on photography     |
| **Monochrome (Navy)**  | Light backgrounds, print materials            |

### Clear Space

Minimum clear space = 1.5x the height of the "V" in the wordmark on all sides.

### Minimum Size

| Context             | Minimum Width |
| ------------------- | ------------- |
| Digital — Full Logo | 120px         |
| Digital — Wordmark  | 80px          |
| Print — Full Logo   | 35mm          |
| Print — Wordmark    | 25mm          |

### Logo Color Rules

| Background                  | Logo Version                   |
| --------------------------- | ------------------------------ |
| White / light surfaces      | Deep Navy (#1A1A2E) monochrome |
| Dark surfaces / photography | White (#FFFFFF) monochrome     |
| Brand Blue backgrounds      | White (#FFFFFF) monochrome     |
| Co-branding / partnerships  | Deep Navy monochrome preferred |

### Logo Don'ts

- Don't rotate, skew, or warp the logo
- Don't change logo colors outside the approved palette
- Don't add drop shadows, gradients, or effects
- Don't place on busy or colorful backgrounds without a semi-transparent overlay
- Don't crop or modify proportions
- Don't recreate the logo in a different typeface
- Don't lock up the logo with other brand marks without approval

---

## 5. Imagery Guidelines

### Photography Style

VividWalls imagery should feel like an interior design editorial — warm, aspirational, and lived-in.

| Attribute           | Guideline                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Lighting**        | Natural light preferred. Warm, soft, directional. Golden hour quality. Avoid flat flash.                  |
| **Spaces**          | Real interiors — living rooms, bedrooms, hotel lobbies, restaurants, offices. No blank white walls.       |
| **Styling**         | Curated but not sterile. Include furnishings, plants, textures that feel inhabited.                       |
| **Color treatment** | Warm tone grade. Slightly lifted shadows. Maintain the art's true colors as hero.                         |
| **Composition**     | Art piece is the focal point. Use leading lines and negative space to draw the eye to the print.          |
| **People**          | Optional. When included, shown from behind or in profile — contemplating the art. Never direct-to-camera. |

### Product Photography

| Type                     | Specification                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- |
| **Flat lay / printable** | Pure original artwork on white — used for Pictorem fulfillment and detail views |
| **Framed mockup**        | Art in frame on neutral wall, slight shadow, consistent lighting                |
| **Lifestyle / in-situ**  | Art installed in styled room setting per segment banners                        |
| **Detail crop**          | Tight crop on texture, brushwork, or material quality                           |

### Segment-Specific Imagery

| Segment            | Visual Direction                                  | Reference Aesthetic                 |
| ------------------ | ------------------------------------------------- | ----------------------------------- |
| DTC Home Decor     | Warm, inviting living spaces                      | West Elm catalog, Apartment Therapy |
| Interior Designers | Aspirational editorial, gallery-wall compositions | Architectural Digest                |
| Hospitality        | Luxury lobbies, warm layered environments         | Aman Resorts, Edition Hotels        |
| Restaurants & Bars | Dramatic, moody, atmospheric                      | Design-forward speakeasies          |
| Commercial Offices | Clean, confident, polished stone and glass        | WeWork premium, Fortune 500 lobbies |

### Illustrations & Icons

- Style: Outlined, minimal, 24px base grid
- Stroke: 1.5px consistent
- Corner radius: 2px
- Colors: Deep Navy or Mid Gray on light backgrounds; White on dark
- Reserved for UI elements only — never use illustrations in place of photography for marketing

---

## 6. Design Components

### Buttons

| Type                  | Background  | Text    | Border      | Radius |
| --------------------- | ----------- | ------- | ----------- | ------ |
| Primary               | #0061FF     | #FFFFFF | none        | 4px    |
| Primary Hover         | #0050D4     | #FFFFFF | none        | 4px    |
| Secondary             | transparent | #0061FF | 1px #0061FF | 4px    |
| Ghost                 | transparent | #1A1A2E | none        | 4px    |
| Accent (Sale/Urgency) | #E94560     | #FFFFFF | none        | 4px    |

### Spacing Scale

| Token | Value | Usage                           |
| ----- | ----- | ------------------------------- |
| 2xs   | 4px   | Tight icon spacing              |
| xs    | 8px   | Compact elements, badge padding |
| sm    | 12px  | Form field padding              |
| md    | 16px  | Standard component spacing      |
| lg    | 24px  | Card padding, section gaps      |
| xl    | 32px  | Major section spacing           |
| 2xl   | 48px  | Page section dividers           |
| 3xl   | 64px  | Hero section padding            |
| 4xl   | 96px  | Above-the-fold breathing room   |

### Border Radius

| Element               | Radius                                        |
| --------------------- | --------------------------------------------- |
| Buttons               | 4px                                           |
| Cards                 | 8px                                           |
| Product images        | 0px (sharp edges — art should not be rounded) |
| Inputs                | 4px                                           |
| Modals                | 12px                                          |
| Badges / Tags         | 2px                                           |
| Avatar / Edition seal | 9999px (circle)                               |

### Shadows

| Level     | Value                          | Usage                     |
| --------- | ------------------------------ | ------------------------- |
| Subtle    | 0 1px 2px rgba(26,26,46,0.06)  | Cards at rest             |
| Medium    | 0 4px 12px rgba(26,26,46,0.08) | Cards on hover, dropdowns |
| Elevated  | 0 8px 24px rgba(26,26,46,0.12) | Modals, floating elements |
| Art frame | 0 2px 8px rgba(26,26,46,0.10)  | Framed product imagery    |

---

## 7. Certificate of Authenticity

Every VividWalls purchase includes a Certificate of Authenticity. The certificate is a core brand artifact.

| Element      | Specification                                                 |
| ------------ | ------------------------------------------------------------- |
| Paper        | Heavy cream stock (digital: Gallery White #FAFAF8 background) |
| Border       | Warm Gold (#C9A96E) hairline rule                             |
| Heading      | Playfair Display, 24px, Deep Navy                             |
| Edition text | Playfair Display Italic, 14px — "Edition 12 of 50"            |
| Body         | Inter, 14px, Charcoal                                         |
| Signature    | Kingler Bercy artist signature (script reproduction)          |
| Seal         | VividWalls circular monogram in Warm Gold                     |

---

## 8. Social Media Guidelines

### Profile Treatment

| Platform  | Avatar                           | Cover/Banner                                |
| --------- | -------------------------------- | ------------------------------------------- |
| Instagram | VividWalls stacked logo on white | Rotating featured collection                |
| Pinterest | Stacked logo                     | Collection board covers per category        |
| LinkedIn  | Stacked logo                     | Segment banner (Commercial/Interior Design) |
| Facebook  | Stacked logo                     | Lifestyle hero with tagline overlay         |

### Content Pillars

| Pillar    | Ratio | Content Types                                                |
| --------- | ----- | ------------------------------------------------------------ |
| Product   | 40%   | New releases, collection launches, detail shots              |
| Lifestyle | 30%   | In-situ photography, room transformations, customer features |
| Process   | 15%   | Behind-the-scenes creation, material close-ups, studio shots |
| Community | 15%   | Designer spotlights, trade partnerships, collector stories   |

### Hashtag Strategy

| Category        | Tags                                                |
| --------------- | --------------------------------------------------- |
| Always include  | #VividWalls #WallArt #HomeDecor                     |
| Art-focused     | #ContemporaryArt #ArtPrint #AbstractArt #ModernHome |
| Interior Design | #InteriorDesign #RoomStyling #ArtForHome            |
| Lifestyle       | #CozyVibes #StylishSpaces #ArtMeetsHome             |

### Caption Style

- Lead with the art or the transformation, not the sale
- Use Playfair-style elegance in tone — poetic but not purple
- Include price naturally, not as the headline
- Always end with a clear CTA ("Link in bio", "Shop now at vividwalls.co")

---

## 9. Packaging & Print

### Shipping Materials

| Element            | Specification                                                  |
| ------------------ | -------------------------------------------------------------- |
| Box exterior       | Kraft brown with white VividWalls wordmark stamp               |
| Interior tissue    | White acid-free tissue                                         |
| Certificate sleeve | Cream envelope, Warm Gold VividWalls seal                      |
| Thank you card     | 4x6, Gallery White stock, Playfair Display heading, Inter body |
| Sticker            | 2" circle, VividWalls monogram, matte finish                   |

### Print Collateral

- Business cards: Deep Navy stock, white foil wordmark, Inter contact details
- Lookbook: Saddle-stitched, uncoated stock, editorial layout with generous white space
- Trade sheets: Clean, data-forward layout — product grid with pricing, dimensions, medium

---

## 10. Co-Branding & Partnerships

- VividWalls logo appears at equal or greater size to partner logos
- Maintain minimum clear space even in lockups
- Never alter VividWalls colors to match a partner's palette
- For gallery partnerships, use the "Exhibited at [Gallery Name]" format in Playfair Display Italic
- Artist collaborations credit format: "[Title] — A VividWalls x [Artist Name] Edition"

---

## AI Image Generation

### Base Prompt Template

Always prepend to image generation prompts:

```
Premium wall art in a warm, editorially-styled interior. Natural directional lighting, golden hour quality. Warm color grade with slightly lifted shadows. Art piece is the clear focal point on the wall. Styled furnishings, plants, and textures visible but not competing. Aspirational but lived-in atmosphere. Colors: deep navy (#1A1A2E), vivid blue (#0061FF), warm gold accents (#C9A96E), gallery white (#FAFAF8).
```

### Style Keywords

| Category    | Keywords                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| Lighting    | Soft natural light, golden hour, warm directional, window light             |
| Mood        | Aspirational, curated, intimate, gallery-quality, editorial                 |
| Composition | Art as focal point, leading lines, generous negative space, rule of thirds  |
| Treatment   | Warm tone grade, lifted shadows, true art colors, slight film grain         |
| Aesthetic   | Modern editorial, Architectural Digest, design-forward, premium residential |

### Visual Don'ts

| Avoid                 | Reason                           |
| --------------------- | -------------------------------- |
| Flat white walls      | Feels sterile; art needs context |
| Direct flash lighting | Destroys the editorial warmth    |
| Oversaturated colors  | Competes with the art            |
| Stock photo aesthetic | Generic and off-brand            |
| Cluttered interiors   | Art must remain the hero         |

---

## Changelog

| Version | Date       | Changes                  |
| ------- | ---------- | ------------------------ |
| 1.0     | 2026-04-05 | Initial brand guidelines |
