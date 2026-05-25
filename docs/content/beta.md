# Threadline — Beta Landing Page Content Draft

**Page:** `/beta`
**Last Updated:** April 17, 2026
**Status:** Draft for review — refine before implementing in SvelteKit

---

## Design Notes

- This is a new page — no existing implementation
- Match existing design system: corner bracket cards, `font-mono` labels, Motion reveals
- Single-purpose page: the entire goal is email capture for the waitlist
- Keep it focused — fewer sections than homepage, every element drives toward the signup form
- The signup form should appear twice: once above the fold, once at bottom
- Consider a sticky CTA bar that appears on scroll (after the hero form scrolls out of view)

---

## SECTION 1 — Hero + Signup Form

**Layout:** Two-column. Headline + value prop left, signup form right.

**Mono label:** `Beta — April 2026`

**Headline:**

> Be first to see what AI-powered wholesale looks like.

**Supporting text:**

> Threadline Beta opens to a small group of multi-brand reps, showroom owners, and agencies. Get in early, shape the product, and lock in founding member pricing.

**Signup form (right column):**

- Email input field (placeholder: "you@youragency.com")
- Role select: `Independent Rep` | `Showroom Owner` | `Sales Agency` | `Brand`
- Number of brands managed: `1-3` | `4-10` | `11-25` | `25+`
- Button: `Join Beta`
- Subtext below button: "No credit card required. We'll reach out within 48 hours."

> **Note on form fields:** Role and brand count serve two purposes — they qualify leads (prioritize agencies managing 10+ brands) and they personalize follow-up emails. Keep the form short. Three fields max. Every additional field reduces conversion.

---

## SECTION 2 — What You Get

**Layout:** Centered header, then 3-column card grid.

**Mono label:** `Founding Member Benefits`

**Section headline:**

> Beta isn't just early — it's different.

**Card 1 — Shape the product**

> Your feedback goes directly into the roadmap. Beta members get a direct line to the team and priority on feature requests. This isn't a closed test — it's a partnership.

**Card 2 — Founding member pricing**

> Lock in Beta pricing for life. When we raise prices at public launch, your rate stays the same. No tricks, no expiration.

**Card 3 — Priority onboarding**

> White-glove setup with the founding team. We'll help you import accounts, configure commissions, connect your brands, and get Stitches learning your portfolio — all in under an hour.

---

## SECTION 3 — What Threadline Does (Brief)

**Layout:** Centered header, then two-column feature highlights with icons. Keep this brief — this page isn't the features page.

**Mono label:** `The Platform`

**Section headline:**

> Everything you need to manage, sell, and grow your wholesale business.

**Feature row 1 (left + right):**

**AI-Powered Insights**

> Stitches watches your entire book of business and tells you what to do next. Revenue gaps, reorder signals, and buyer predictions — in plain English, every morning.

**Autonomous Agents**

> Workers handle commission tracking, order follow-ups, and buyer alerts in the background. Custom agents let you automate the signals only you would think to look for.

**Feature row 2 (left + right):**

**Full Order Pipeline**

> Draft to delivery in one place. Line items, status tracking, PDF generation, email sending, and commission calculations — all connected.

**Multi-Brand Intelligence**

> See patterns that no single-brand platform can. Which accounts are under-penetrated, which brands pair well together, and where your territory has room to grow.

**Feature row 3 (left + right):**

**Commission Automation**

> Set rates per brand, define splits for sub-reps and showrooms, add account-level overrides. Threadline calculates everything. No spreadsheets.

**Buyer Portal**

> Give your buyers a branded portal to browse products, place orders, and track deliveries. Orders flow directly into your pipeline.

**Link:** `See all features →` (links to `/features`)

---

## SECTION 4 — How It Works

**Layout:** Three-column numbered steps (match Intelligence page style).

**Mono label:** `Getting Started`

**Section headline:**

> Live in under an hour.

**Step 01 — Connect**

> Import your accounts from CSV or start fresh. Add your brands, set commission rates, and connect your email. Threadline adapts to your existing workflow.

**Step 02 — Learn**

> Stitches maps your portfolio — buyer patterns, brand performance, territory gaps, order history. Intelligence starts arriving immediately.

**Step 03 — Sell**

> Daily briefings tell you who to call, what to pitch, and what's at risk. Agents handle the follow-ups. You focus on closing.

---

## SECTION 5 — Who It's For

**Layout:** Three-column persona cards (light background, minimal).

**Mono label:** `Built For`

**Section headline:**

> Designed for the people who actually move goods.

**Persona 1 — Independent Reps**

> You carry 5+ brands, cover a territory, and live in your car half the month. Threadline keeps your entire book of business organized and tells you what to focus on today — not just what happened last quarter.

**Persona 2 — Showroom Owners**

> You manage a team of reps, dozens of brands, and hundreds of accounts. Threadline gives you visibility across every rep's book, automates commission splits, and surfaces the insights your team is too busy to find.

**Persona 3 — Sales Agencies**

> You run a business, not just a line. Threadline gives you the operational infrastructure — team management, brand connections, reporting, and AI automation — to scale without adding headcount.

---

## SECTION 6 — FAQ (Beta Specific)

**Layout:** Single-column accordion or two-column split.

**Q: When does Beta start?**
A: April 30, 2026. We're accepting requests now and will begin onboarding founding members on launch day.

**Q: How many spots are available?**
A: We're limiting Beta to 50 organizations to ensure every member gets hands-on support from the founding team.

**Q: Is Beta free?**
A: Yes. Beta is free for the first 30 days. After that, founding members lock in a discounted rate for as long as they stay on Threadline.

**Q: What happens after Beta?**
A: Early Release opens in late May, and public launch is June 30. Beta members keep their founding pricing and get priority access to every new feature.

**Q: Can I invite my team?**
A: Yes. Invite team members during Beta at no additional cost. Your entire org can use the platform from day one.

**Q: What if I'm already using Brandboom or JOOR?**
A: Threadline doesn't replace your brand platforms. It adds the intelligence and automation layer that sits on top of however you're already working. Brands don't need to change anything.

**Q: Is my data safe?**
A: Yes. Every organization's data is completely isolated using row-level security. Brand data is never shared across organizations. We're built on Supabase with enterprise-grade encryption.

---

## SECTION 7 — Final CTA (Repeat Signup Form)

**Layout:** Centered with the same signup form from the hero, repeated.

**Headline:**

> Join the founding group.

**Supporting text:**

> 50 spots. Free for 30 days. Founding pricing locked in for life.

**[Repeat signup form from Section 1]**

---

## SEO Metadata

```html
<title>Beta — Threadline | AI-Powered Wholesale Platform</title>
<meta
	name="description"
	content="Join Threadline Beta — the AI-powered wholesale intelligence platform for multi-brand sales reps, showroom owners, and agencies. 50 spots available. Free for 30 days. Founding pricing locked in for life."
/>

<!-- Open Graph -->
<meta property="og:title" content="Threadline Beta — Be First" />
<meta
	property="og:description"
	content="50 spots for founding members. AI-powered wholesale intelligence with cross-brand insights, autonomous agents, and commission automation. Free for 30 days."
/>
<meta property="og:image" content="https://threadline.systems/og-beta.png" />
<meta property="og:url" content="https://threadline.systems/beta" />
<meta property="og:type" content="website" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Threadline Beta — 50 Founding Member Spots" />
<meta
	name="twitter:description"
	content="AI-powered wholesale intelligence. Free for 30 days. Founding pricing for life."
/>
<meta name="twitter:image" content="https://threadline.systems/og-beta.png" />
```

---

## Conversion Strategy Notes

**Primary metric:** Email signups (waitlist captures)

**Form handling options:**

1. **Supabase-native** — Store signups in a `waitlist` table. Simple, no third-party dependency. Can trigger a Supabase Edge Function to send confirmation email via Brevo.
2. **Loops.so** — Dedicated waitlist tool with built-in email sequences. More polished but adds a dependency.
3. **ConvertKit** — If you choose ConvertKit as email platform (per Marketing BRD), use their embedded form for direct list integration.

**Recommendation:** Start with Supabase + Brevo for Beta. Brevo handles both transactional and marketing email, so no migration needed for nurture sequences.

**Post-signup flow:**

1. User submits form → row created in `waitlist` table
2. Confirmation email sent immediately (Brevo): "You're on the list. Here's what happens next."
3. 3-day drip email: "What Threadline can do for [their role]" (personalized by role selection)
4. 7-day drip email: "Meet Stitches — your AI co-pilot" (feature preview)
5. Launch day email: "You're in. Here's your invite link." (April 30)

---

_This is a content draft for review. Once approved, implement as a new SvelteKit route at `/beta` using the existing design system._
