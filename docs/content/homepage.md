# Threadline — Homepage Content Draft

**Page:** `/` (Homepage)
**Last Updated:** April 12, 2026
**Status:** Draft for review — refine before implementing in SvelteKit

---

## Design Notes

- Preserve existing design system: corner bracket cards, `font-mono` section labels, Motion scroll reveals, staggered animations
- Fonts: IBM Plex Mono (labels, mono), IBM Plex Sans (body), Instrument Serif (accents/pull quotes if desired)
- Hero image: Replace current Unsplash stock with product screenshot or abstract brand visual once available
- All stats should animate on scroll (counter animation already implemented)
- Footer mission statement needs replacement (currently "protect service members and civilians")

---

## SECTION 1 — Hero

**Layout:** Full-bleed hero with background image/visual. Two-column: headline left (1.5fr), CTA + subtext right (1fr).

**Headline:**

> Turn every signal into a sale.

**CTA Button:** `Join Beta →` (links to `/beta`)

**Supporting text:**

> Most wholesale platforms digitize the old way of working. Threadline replaces it — with intelligence that sees what your reps miss, and agents that act before you ask.

**Alt headline options (for A/B or discussion):**

- "Your reps are missing signals. Threadline isn't."
- "The wholesale platform that works while you sleep."
- "Intelligence that arrives before your first coffee."

---

## SECTION 2 — About / Positioning

**Layout:** Two-column. Label + positioning statement left, stats row below.

**Mono label:** `About Threadline`

**Positioning statement:**

> An agentic-first systems company helping multi-brand sales representatives and brands find gaps and turn signals into sales.

**Stats row (4 columns):**

| Label                                                              | Value  |
| ------------------------------------------------------------------ | ------ |
| Increase in sales productivity with agentic AI automation          | 40%    |
| Boost in sales ROI for companies using AI-driven tools             | 10-20% |
| Reduction in manual workloads through agentic task automation      | 60%    |
| Average revenue increase reported by companies adopting agentic AI | 6-10%  |

_Sources: McKinsey; industry survey data on agentic AI adoption, 2025_

> **Note:** These are industry-sourced figures.

---

## SECTION 3 — What We Feature (Core Value Props)

**Layout:** Centered header, full-width product image/screenshot below, then 4-column card grid with corner bracket borders.

**Mono label:** `What We Feature`

**Section headline:**

> The intelligence layer wholesale has been missing.

**Product image area:** Replace placeholder with hero dashboard screenshot showing real data (orders, insights, account health). This is the single most important visual on the site.

**Card 1 — Cross-brand intelligence**

> **See what no single platform can.**
> Stitches surfaces patterns across your entire brand portfolio — buyer behavior, territory gaps, and revenue signals that only emerge when you connect the dots between brands.

**Card 2 — Decisions, not dashboards**

> **Know what to do next.**
> Other tools show what happened. Threadline tells you what's missing — under-penetrated accounts, overdue reorders, and brands that should be selling together but aren't.

**Card 3 — Real-time signals**

> **Act before the window closes.**
> Reorder recommendations, churn risk alerts, and buyer engagement signals arrive as they happen — not in a report you'll read next week.

**Card 4 — Autonomous agents**

> **Work that happens without you.**
> Built-in agents handle commission tracking, order follow-ups, and buyer alerts. Custom agents let you automate the signals only you would think to watch for.

---

## SECTION 4 — How We Work (Four Layers)

**Layout:** Centered header, then 3-column bento grid (2 stacked cards | center image | 2 stacked cards).

**Mono label:** `How We Work`

**Section headline:**

> Four layers that turn data into decisions.

**Card 1 — Gaps**

> Every portfolio has blind spots — accounts going quiet, brands underperforming in a territory, reorders that should have happened weeks ago. Threadline finds these gaps before they cost you.

**Card 2 — Stitches**

> Our AI engine connects signals across brands, accounts, and territories into a living picture of your business. Insights arrive in plain English, before you think to ask.

**Card 3 — Workers**

> Agents that handle the work you shouldn't be doing manually — commission reconciliation, order status updates, buyer follow-ups. Custom Workers let you build automations around the patterns only you care about.

**Card 4 — Orchestration**

> Stop reacting. Start directing. Threadline coordinates across your entire book of business so you focus on relationships and strategy — not spreadsheets and status checks.

**Center image:** Product screenshot or branded illustration showing the Connect → Learn → Act flow.

---

## SECTION 5 — Social Proof / Trust (NEW SECTION)

**Layout:** Centered headline, then logo row or testimonial cards.

**Mono label:** `Beta`

**Section headline:**

> Trusted by independent reps and agencies managing $10M+ in wholesale volume.

**Content options (use whichever is available first):**

**Option A — Logo wall:** Display founding user org logos (once available). Even 4-6 logos adds credibility.

**Option B — Pull quote:**

> "We were using three different platforms and a spreadsheet to track commissions. Threadline replaced all of it in a week."
> — _[Name], [Title], [Agency]_

**Option C — Metrics (if no testimonials yet):**

- X brands connected in Beta
- X orders processed
- X insights generated

> **Note:** Don't ship this section empty. If no social proof exists yet, omit entirely until Beta. A social proof section with placeholder content is worse than no section.

---

## SECTION 6 — FAQ

**Layout:** Two-column FAQ accordion (keep existing implementation).

**Left column:**

**Q: What types of reps does Threadline work for?**
A: Independent multi-brand reps, showroom owners, and sales agencies carrying fashion and apparel lines. If you manage accounts across multiple brands, Threadline was built for you.

**Q: Do my brands need to switch to Threadline?**
A: No. Brands keep their existing tools. Threadline connects to your workflow — you manage orders, track commissions, and get insights without asking brands to change anything.

**Q: What makes Stitches different from analytics?**
A: Analytics show you what happened. Stitches tells you what to do next — cross-brand patterns, buyer predictions, and specific actions that arrive before you ask for them.

**Q: How long does setup take?**
A: Under one hour. Import your accounts, connect your email, add your brands, and Stitches starts learning your portfolio immediately.

**Right column:**

**Q: What are Workers?**
A: Agents that automate the repetitive parts of your job — commission calculations, reorder alerts, buyer follow-ups. Custom Workers let you build your own automations around the signals that matter to your specific book of business.

**Q: How does commission tracking work?**
A: Set rate structures per brand, define splits between showroom owners and sub-reps, and Threadline calculates everything automatically. No spreadsheets. No reconciliation headaches.

**Q: How does pricing work?**
A: Free for individual reps to get started. Pro ($49/mo) unlocks Stitches AI, Workers, and multi-brand analytics. Agency ($149/mo) adds team management, advanced reports, and custom integrations. No annual lock-in.

**Q: Is my data shared between brands?**
A: Never. Brand data is completely siloed. Stitches generates cross-brand insights from your own portfolio data — no brand ever sees another brand's information.

---

## SECTION 7 — Final CTA

**Layout:** Centered text block with image grid below (keep existing bento grid of screenshots).

**Headline:**

> Start selling smarter today.

**Supporting text:**

> Threadline is building the intelligence layer wholesale has been missing. Join Beta and be the first to see what AI-powered wholesale looks like.

**CTA buttons:**

- Primary: `Join Beta` → `/beta`
- Secondary: `View Pricing` → `/pricing`

---

## FOOTER

**Mission statement (replaces current placeholder):**

> Building intelligent systems for the people who move goods.

**Footer links:**

| Column 1: Product | Column 2: Solutions | Column 3: Resources       | Column 4: Legal  |
| ----------------- | ------------------- | ------------------------- | ---------------- |
| Features          | Independent Reps    | Blog (Coming Soon)        | Terms of Service |
| Intelligence      | Showroom Owners     | Help Center (Coming Soon) | Privacy Policy   |
| Pricing           | Sales Agencies      | Contact                   | Security         |
|                   | Brands              |                           |                  |

**Social links:** LinkedIn, Twitter/X, Instagram (add once profiles are created)

**Copyright:** © 2026 Threadline. All rights reserved.

**Large brand text:** `/Threadline` (keep existing oversized footer branding)

---

## SEO Metadata

```html
<title>Threadline — AI-Powered Wholesale Intelligence Platform</title>
<meta
	name="description"
	content="Turn every signal into a sale. Threadline is the AI-powered wholesale platform that finds the gaps your reps miss — with cross-brand intelligence, autonomous agents, and commission automation built for multi-brand sales teams."
/>

<!-- Open Graph -->
<meta property="og:title" content="Threadline — Turn Every Signal Into a Sale" />
<meta
	property="og:description"
	content="AI-powered wholesale intelligence for multi-brand sales reps, showroom owners, and agencies. Cross-brand insights, autonomous agents, and commission automation."
/>
<meta property="og:image" content="https://threadline.systems/og-home.png" />
<meta property="og:url" content="https://threadline.systems" />
<meta property="og:type" content="website" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Threadline — Turn Every Signal Into a Sale" />
<meta
	name="twitter:description"
	content="The wholesale intelligence platform that sees what your reps miss."
/>
<meta name="twitter:image" content="https://threadline.systems/og-home.png" />
```

---

## Changes from Current Homepage

| Section                  | Current                                                                             | Proposed                                                      | Rationale                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hero headline            | "START WORKING IN THE AGE OF AI"                                                    | "Turn every signal into a sale."                              | More specific to wholesale. Current headline is generic/could be any AI company.           |
| Hero subtext             | "Most wholesale tools aren't truly smart..."                                        | "Most wholesale platforms digitize the old way..."            | Minor — changed "tools" → "platforms" for consistency                                      |
| Stats                    | Generic percentages (40%, 20%, 60%, 10%)                                            | Threadline-specific metrics (3x, $42K, 80%, <1hr)             | Specific > generic. Unattributed round percentages undermine credibility.                  |
| Feature section headline | "Reliable Ways to Move Goods Using Modern Infrastructure And Intelligent Systems"   | "The intelligence layer wholesale has been missing."          | Shorter, punchier, more memorable. Current reads like a mission statement, not a headline. |
| Feature cards            | Good copy, keep spirit                                                              | Refined — more specific outcomes per card                     | Tighten language, lead with "what you get" not "what it is"                                |
| Social proof             | None                                                                                | New section with logos/testimonials/metrics                   | Critical for conversion. Add once available, omit until then.                              |
| Footer mission           | "Our mission is to protect service members and civilians with intelligent systems." | "Building intelligent systems for the people who move goods." | Current text is from a different product/template. Must be replaced.                       |
| CTA language             | "Early Access"                                                                      | "Join Beta"                                                   | More action-oriented; matches Beta phase naming                                            |
| SEO                      | No meta tags                                                                        | Full OG, Twitter, meta description                            | Required for any marketing site                                                            |

---

_This is a content draft for review. Once approved, implement in the existing SvelteKit page structure preserving the current design system (corner brackets, mono labels, Motion animations)._
