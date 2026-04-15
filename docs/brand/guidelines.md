# /Threadline — Brand Identity & Guidelines

**Version:** 1.0
**Last Updated:** April 12, 2026
**Status:** Living Document

---

## 1. Brand Essence

### 1.1 Positioning Statement

An agentic-first systems company helping multi-brand sales representatives and brands find gaps and turn signals into sales.

### 1.2 Mission

Building intelligent systems for the people who move goods.

### 1.3 Founding Philosophy

Software doesn't fix broken process. Intelligence replaces the need for perfect process. See [philosophy.md](./philosophy.md) for the full document — it should inform product decisions, marketing copy, and sales conversations.

### 1.4 Brand Personality

Threadline is precise, intelligent, and quietly confident. We don't shout — we surface what others miss. The brand feels like a well-engineered tool: clean lines, clear hierarchy, zero decoration for its own sake. Every element earns its place.

**Brand attributes:**

- **Precise** — Technical without being cold. We speak in specifics, not generalities.
- **Intelligent** — We show the thinking, not just the output. Insights, not dashboards.
- **Quiet confidence** — No exclamation marks. No superlatives. The product speaks.
- **Systematic** — Patterns, grids, structure. The visual language reflects how we think about data.
- **Human-first** — Built for people in motion — in cars, at shows, on the floor. Never forget the rep.

### 1.5 Brand Voice

**Tone:** Direct, clear, grounded. Write like you're explaining something important to a smart colleague — not pitching, not dumbing down.

**Do:**

- Lead with the outcome, not the feature
- Use specifics ("surfaces reorder gaps across 12 brands") over vague claims ("improves productivity")
- Write in short, declarative sentences
- Use industry language naturally (line sheets, sell-through, at-once orders)
- Let the product do the convincing

**Don't:**

- Use superlatives (best, revolutionary, game-changing)
- Write in ALL CAPS for emphasis (the hero headline is the one exception)
- Use emojis in product or marketing copy
- Say "AI-powered" in every sentence — show what AI does, don't label it
- Use jargon that excludes newcomers ("agentic" is for internal/investor use, not buyer-facing copy)

---

## 2. Wordmark & Logo

### 2.1 Primary Wordmark

The Threadline wordmark is `/Threadline` — the forward slash is an integral part of the brand identity and must never be removed.

**Construction:**

- The `/` (forward slash) precedes "Threadline" with no space
- Set in **IBM Plex Sans** at **Medium (500) weight**
- The slash uses the same weight and size as the text — it is not a decorative element, it is part of the name

**The forward slash represents:**

- A path — navigating systems, finding direction
- A delimiter — separating signal from noise
- A command — invoking action, like a terminal prompt

### 2.2 Wordmark Variations

| Variation            | Usage                                    | Specification                                                         |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| **Primary**          | Marketing site, documents, presentations | Foreground on Background (`hsl(216, 5%, 17%)` on `hsl(0, 0%, 98.5%)`) |
| **Reversed**         | Dark backgrounds, sidebar, footer        | Background on Foreground (`hsl(0, 0%, 98.5%)` on `hsl(216, 5%, 17%)`) |
| **Monochrome dark**  | Print, single-color applications         | `#000000` on white                                                    |
| **Monochrome light** | Dark print, merchandise                  | `#FFFFFF` on black                                                    |

### 2.3 Wordmark Sizing

| Context            | Minimum size                                    | Recommended                                                                            |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Navigation         | 16px                                            | 18–20px                                                                                |
| Footer (oversized) | n/a                                             | `clamp(1rem, 17.5dvw, 60dvw)` — the large footer treatment is a signature brand moment |
| Print              | 12pt minimum                                    | 14–18pt                                                                                |
| Favicon            | 16×16px — use `/T` or just `/` as the icon mark |                                                                                        |

### 2.4 Clear Space

Maintain a minimum clear space around the wordmark equal to the height of the capital "T" in the wordmark. No other elements, text, or graphics should intrude into this zone.

### 2.5 Wordmark Don'ts

- Never remove the forward slash
- Never add a space between `/` and `Threadline`
- Never change the typeface
- Never rotate, skew, or distort
- Never add effects (shadows, gradients, outlines, glows)
- Never place on busy photographic backgrounds without a container or overlay
- Never lock up with a tagline directly attached to the wordmark

---

## 3. Color System

### 3.1 Core Palette

The Threadline color system is intentionally restrained. Two colors do the heavy lifting. Everything else is functional.

**Background**

- HSL: `0 0% 98.5%`
- HEX: `#FCFCFC`
- RGB: `252, 252, 252`
- Usage: Page backgrounds, card backgrounds, light surfaces
- Notes: A warm off-white. Not pure white (`#FFF`) — the 1.5% offset avoids the clinical harshness of true white and is easier on the eyes for extended use.

**Foreground**

- HSL: `216 5% 17%`
- HEX: `#292B30`
- RGB: `41, 43, 48`
- Usage: Primary text, borders, wordmark, UI elements
- Notes: A dark slate with a subtle blue-cool undertone (216° hue, 5% saturation). Not pure black — the blue gives it depth and sophistication. This is the brand's signature dark.

### 3.2 Semantic Colors

These are functional colors derived from the core palette. They exist to serve the UI, not to express the brand.

| Token                    | Light Mode HSL   | Dark Mode HSL    | Usage                                |
| ------------------------ | ---------------- | ---------------- | ------------------------------------ |
| `--primary`              | `240 5.9% 10%`   | `0 0% 98%`       | Primary actions, buttons, links      |
| `--primary-foreground`   | `0 0% 98%`       | `240 5.9% 10%`   | Text on primary                      |
| `--secondary`            | `240 4.8% 95.9%` | `240 3.7% 15.9%` | Secondary surfaces, hover states     |
| `--secondary-foreground` | `240 5.9% 10%`   | `0 0% 98%`       | Text on secondary                    |
| `--muted`                | `240 4.8% 95.9%` | `240 3.7% 15.9%` | Disabled states, subtle backgrounds  |
| `--muted-foreground`     | `240 3.8% 46.1%` | `240 5% 64.9%`   | Secondary text, captions, timestamps |
| `--destructive`          | `0 84.2% 60.2%`  | `0 62.8% 30.6%`  | Delete, error, danger states         |
| `--border`               | `216 5% 17%`     | `240 3.7% 15.9%` | Borders, dividers, corner brackets   |
| `--ring`                 | `240 5.9% 10%`   | `240 4.9% 83.9%` | Focus rings for accessibility        |

### 3.3 Sidebar Colors

The sidebar uses a dark treatment regardless of light/dark mode, creating a strong visual anchor on the left edge of the application.

| Token                  | Value               | Usage                                           |
| ---------------------- | ------------------- | ----------------------------------------------- |
| `--sidebar`            | `240 5.9% 10%`      | Sidebar background                              |
| `--sidebar-foreground` | `240 4.8% 95.9%`    | Sidebar text                                    |
| `--sidebar-primary`    | `0 0% 98%`          | Active item                                     |
| `--sidebar-accent`     | `240 3.7% 15.9%`    | Hover/accent                                    |
| `--sidebar-ring`       | `217.2 91.2% 59.8%` | Focus state — the one pop of blue in the system |

### 3.4 Color Principles

- **Two-color dominance.** Background and foreground carry 90%+ of the visual weight. Everything else is supporting.
- **No decorative color.** Color is never used for decoration — only for meaning (state, hierarchy, action).
- **High contrast.** Foreground on background exceeds WCAG AAA contrast requirements (≈14.5:1).
- **Consistent across modes.** Light and dark modes swap, they don't introduce new hues. The palette stays neutral.
- **The one exception:** `--sidebar-ring` at `217.2 91.2% 59.8%` (a vivid blue) is the single accent color in the entire system. It's used only for focus indicators in the sidebar. If the brand ever needs an accent beyond the grayscale, this blue is it.

---

## 4. Typography

### 4.1 Type Stack

Threadline uses three typefaces, each with a distinct role:

**IBM Plex Sans** — Primary typeface

- Usage: Body text, headings, buttons, navigation, UI elements
- Weights: Light (300), Regular (400), Medium (500), SemiBold (600), Bold (700)
- Italics: Available for all weights
- CSS: `font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif`
- Why: IBM Plex is open-source, highly legible, and has a technical character without feeling robotic. The slightly squared letterforms echo the systematic nature of the brand.

**IBM Plex Mono** — System/technical typeface

- Usage: Section labels, metadata, tags, code, data values, timestamps
- Weights: Regular (400), Medium (500), SemiBold (600)
- CSS: `font-family: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace`
- Letter-spacing: `-0.02em` (slightly negative tracking for tighter character fit)
- Why: The mono typeface signals "system" and "data." It's used for labels on the marketing site (`font-mono`) and for all technical/data contexts in the app.

**Instrument Serif** — Accent typeface

- Usage: Pull quotes, editorial moments, contrast headlines (sparingly)
- Weights: Regular, Italic
- CSS: `font-family: "Instrument Serif", Georgia, "Times New Roman", serif`
- Why: Provides contrast and warmth against the geometric sans and mono. Use sparingly — it's a punctuation mark, not a paragraph font.

### 4.2 Type Scale

| Element        | Size               | Weight        | Font      | Usage                             |
| -------------- | ------------------ | ------------- | --------- | --------------------------------- |
| Display / Hero | `text-6xl` (60px)  | Medium (500)  | Plex Sans | Hero headlines on marketing pages |
| H1             | `text-4xl` (36px)  | Medium (500)  | Plex Sans | Page titles, section headlines    |
| H2             | `text-2xl` (24px)  | Medium (500)  | Plex Sans | Card titles, subsection heads     |
| H3             | `text-xl` (20px)   | Medium (500)  | Plex Sans | Feature names, FAQ questions      |
| Body Large     | `text-lg` (18px)   | Regular (400) | Plex Sans | Marketing body text, descriptions |
| Body           | `text-base` (16px) | Regular (400) | Plex Sans | App body text, paragraphs         |
| Small          | `text-sm` (14px)   | Regular (400) | Plex Sans | Secondary text, captions          |
| Mono Label     | `text-base` (16px) | Regular (400) | Plex Mono | Section labels, tags, metadata    |
| Data Value     | `text-4xl` (36px)  | Medium (500)  | Plex Sans | Stats, counters, metrics          |

### 4.3 Typography Rules

- **Headings** are never bold (700) on marketing pages. Use Medium (500) for a refined, unhurried feel.
- **Mono labels** are always used for section identifiers on marketing pages (e.g., `[Features]`, `About Threadline`, `How We Work`). They signal structure.
- **Body text** uses `text-foreground/60` opacity for secondary/supporting copy on marketing pages. This creates a clear hierarchy without introducing new colors.
- **No uppercase transforms** except for the hero headline ("START WORKING IN THE AGE OF AI" — this convention may be revisited).
- **Line height** follows Tailwind defaults — `leading-normal` (1.5) for body, `leading-tight` (1.25) for headings.

---

## 5. Spacing & Layout

### 5.1 Border Radius

Threadline uses **sharp corners by default** (`--radius: 0`). This is a defining characteristic of the brand's visual identity.

| Token         | Value  | Usage                                                 |
| ------------- | ------ | ----------------------------------------------------- |
| `--radius`    | `0px`  | Default — sharp corners everywhere                    |
| `--radius-xl` | `4px`  | Minimal rounding — used sparingly for softer contexts |
| `rounded-2xl` | `16px` | Marketing cards (dark bento cards in "How We Work")   |
| `rounded-4xl` | `32px` | Hero images, large feature images on marketing pages  |

**The rule:** UI components (buttons, inputs, cards) use sharp corners. Marketing hero images and large visual containers use generous rounding (2xl–4xl) for contrast. This creates a tension between the precise UI and the expansive imagery that defines the Threadline look.

### 5.2 Page Margins

- Marketing pages: `px-8` (32px) horizontal padding
- Section spacing: `py-24` (96px) vertical padding between sections
- Hero top padding: `pt-32` (128px) to clear the fixed navigation
- Content max-width: `max-w-220` (880px) for text blocks, full-width for images and card grids

### 5.3 Grid System

- Marketing feature grids: 3 or 4 column (`grid-cols-3`, `grid-cols-4`)
- Two-column layouts: `grid-cols-[1.5fr_1fr]` or `grid-cols-[1fr_1.5fr]` (asymmetric — never 50/50)
- Card gaps: `gap-4` (16px) for tight grids, `gap-8` (32px) for loose grids
- Bento grids: 3-column with mixed card heights for the "How We Work" section

---

## 6. Visual Elements

### 6.1 Corner Bracket Cards

The signature visual element of Threadline's marketing design. Feature cards are bordered by corner brackets rather than full borders, creating an open, technical aesthetic.

**Construction:**

```
┌─────────────────────────┐
│                         │  ← Top: 16px corner pieces with border-t + border-l/r
│    [Icon 48×48]         │
│    Heading              │  ← Content area with side borders (1px lines)
│    Body text            │
│                         │
└─────────────────────────┘  ← Bottom: 16px corner pieces with border-b + border-l/r
```

The corners are `16px × 16px` divs with partial borders. The sides are `1px` vertical lines. The middle content area has no border — the openness is the point.

**Usage:** Feature cards on the homepage, features page, and intelligence page. Do not use for app UI components — this is a marketing-only element.

### 6.2 Icons

- Style: Outlined stroke icons, `stroke-width="1.25"`
- Size: `48×48px` for marketing feature cards
- Source: Custom SVGs matching the thin-line aesthetic (similar to Lucide but with lighter stroke weight)
- Color: `currentColor` (inherits from text color)
- Never use filled icons. The outlined style matches the corner bracket openness.

### 6.3 Photography & Imagery

**Marketing hero images:**

- Full-bleed or contained in `rounded-4xl` containers
- High-contrast, desaturated editorial photography
- Subjects: Fashion/apparel industry, wholesale environments, professional settings
- Avoid: Stock photography that feels generic. If a photo could be on any SaaS site, don't use it.

**Product screenshots:**

- Wrap in browser mockup frames or show clean, uncropped UI
- Populate with realistic (not lorem ipsum) data
- Dark sidebar on left should always be visible — it's a distinctive element

**Placeholder treatment:**

- Empty image areas use `bg-neutral-300` (light) or `bg-neutral-900` (dark)
- Marketing pages use `bg-black rounded-4xl` for screenshot placeholder areas

### 6.4 Motion & Animation

Threadline uses the **Motion** library (formerly Framer Motion) for scroll-triggered animations on marketing pages.

**Principles:**

- Animations reveal, they don't perform. Content slides up and fades in — nothing bounces, spins, or overshoots.
- Easing: `[0.16, 1, 0.3, 1]` — a custom ease-out curve with a fast start and gentle settle.
- Duration: `0.6–0.9s` for reveals, `2s` for counter animations.
- Stagger: `0.08–0.12s` delay between sibling elements for cascading reveals.
- Respect `prefers-reduced-motion` — animations are disabled entirely when the user has this preference set.

**Animation types:**

- `.h-reveal` — Hero elements: `opacity [0→1], y [60→0]`, staggered by 0.12s
- `.reveal` — Scroll-triggered: `opacity [0→1], y [40→0]`, triggered at 15% viewport intersection
- `[data-stagger]` — Parent container triggers children: `opacity [0→1], y [30→0]`, children staggered by 0.08s
- `.stats-row` — Counter animation: numbers count up from 0 over 2s

### 6.5 Texture & Grain

A subtle grain overlay is available via the `.grain` class:

- SVG noise pattern using `feTurbulence` (fractal noise)
- `18% opacity`, `overlay` blend mode
- Fixed positioning (doesn't scroll with content)
- Use sparingly — best on dark hero areas or editorial sections for a premium print-like feel

---

## 7. Application UI vs Marketing

Threadline has two distinct visual contexts that share the same color system and typography but differ in layout and ornamentation.

| Aspect          | Application (Portal)                  | Marketing (Public Site)                                     |
| --------------- | ------------------------------------- | ----------------------------------------------------------- |
| Border radius   | Sharp (`0px`) everywhere              | Sharp for UI, `rounded-2xl`–`4xl` for hero images           |
| Animations      | Minimal — functional transitions only | Rich scroll reveals, staggered cascades, counter animations |
| Corner brackets | Never                                 | Signature feature card element                              |
| Mono labels     | Used for metadata/tags                | Used for section identifiers                                |
| Photography     | Product screenshots only              | Editorial photography, lifestyle imagery                    |
| Grid density    | Dense, data-oriented                  | Spacious, generous whitespace                               |
| Footer          | Minimal app footer                    | Oversized `/Threadline` brand moment                        |
| Grain overlay   | Never                                 | Sparingly on dark sections                                  |

---

## 8. File Formats & Assets

### 8.1 Required Logo Files

| File                            | Format           | Usage                                        |
| ------------------------------- | ---------------- | -------------------------------------------- |
| `threadline-wordmark-dark.svg`  | SVG              | Primary wordmark (dark on light)             |
| `threadline-wordmark-light.svg` | SVG              | Reversed wordmark (light on dark)            |
| `threadline-wordmark-black.svg` | SVG              | Pure black monochrome                        |
| `threadline-wordmark-white.svg` | SVG              | Pure white monochrome                        |
| `threadline-icon.svg`           | SVG              | `/T` or `/` icon mark for favicon, app icons |
| `threadline-og.png`             | PNG 1200×630     | Default Open Graph share image               |
| `favicon.ico`                   | ICO 16×16, 32×32 | Browser favicon                              |
| `apple-touch-icon.png`          | PNG 180×180      | iOS home screen icon                         |

### 8.2 Color Format Reference

Always specify colors in HSL as the source of truth. Convert as needed:

| Name                | HSL                 | HEX       | RGB             |
| ------------------- | ------------------- | --------- | --------------- |
| Background          | `0 0% 98.5%`        | `#FCFCFC` | `252, 252, 252` |
| Foreground          | `216 5% 17%`        | `#292B30` | `41, 43, 48`    |
| Primary             | `240 5.9% 10%`      | `#181820` | `24, 24, 32`    |
| Muted Text          | `240 3.8% 46.1%`    | `#717179` | `113, 113, 121` |
| Destructive         | `0 84.2% 60.2%`     | `#EF4444` | `239, 68, 68`   |
| Sidebar Accent Blue | `217.2 91.2% 59.8%` | `#3B82F6` | `59, 130, 246`  |

---

## 9. Usage Examples

### 9.1 Marketing Section Pattern

```
[Mono label]        ← font-mono, regular weight
Section Headline    ← text-4xl, medium weight, centered
Supporting text     ← text-lg, text-foreground/60
[Visual / Cards]    ← corner bracket cards or product screenshot
```

### 9.2 Button Styles

| Type          | Style                                             | Usage                                                  |
| ------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Primary CTA   | `bg-foreground text-primary-foreground px-8 py-3` | Main actions: "Join Early Access", "Get Started"       |
| Secondary CTA | `border border-foreground px-8 py-3`              | Supporting actions: "View Pricing", "See All Features" |
| Ghost         | No background, no border, text only               | Navigation links, inline actions                       |

Buttons use **sharp corners** (no border-radius), **no text transform**, and **font-medium** weight.

### 9.3 Card Pattern (Marketing)

```
┌── ──────────────── ──┐
│                      │
│   [48px icon]        │
│   Card Title         │  ← text-2xl
│   Card description   │  ← text-base, regular
│                      │
└── ──────────────── ──┘
```

### 9.4 Dark Bento Card (Marketing)

```css
bg-neutral-900 text-white rounded-2xl p-8
```

Used in the "How We Work" section. Interior cards with white text on near-black backgrounds. The `rounded-2xl` softens them within the sharp-cornered page grid.

---

## 10. Brand Don'ts

- Never use gradients anywhere in the brand
- Never use drop shadows on text
- Never use more than two font weights on a single page element
- Never use colored backgrounds (other than foreground/background and neutral-900)
- Never add decorative borders or ornamental dividers
- Never use stock illustrations or clipart
- Never use rounded buttons (buttons are always sharp-cornered)
- Never use the wordmark smaller than 12pt / 16px
- Never place the wordmark on a background that doesn't provide sufficient contrast
- Never animate the wordmark itself

---

_This is a living document. Update as the brand evolves, new assets are created, or design patterns change._
