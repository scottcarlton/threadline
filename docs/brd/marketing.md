# Business Requirements Document: Marketing & Launch

**Product:** Threadline
**Version:** 1.0
**Last Updated:** April 12, 2026
**Status:** Living Document
**Related:** [features.md](./features.md) · [roles-permissions.md](./roles-permissions.md)

---

## 1. Overview

This document defines the marketing strategy, website requirements, content plan, and launch timeline for Threadline — a multi-tenant B2B wholesale order management platform for the fashion and apparel industry. The plan covers three release phases from Early Access through Full Release, with a marketing website inspired by the design quality and clarity of Ramp.com, positioned competitively against Brandboom and JOOR.

### 1.1 Release Timeline

| Phase | Date | Description |
|---|---|---|
| **Early Access** | April 30, 2026 | Invite-only release for founding users. Core features complete. Gather feedback, validate product-market fit. |
| **Beta Release** | May 30, 2026 | Open waitlist, expanded access. Marketing site fully live. Content engine running. |
| **Full Release** | June 30, 2026 | Public launch. All features, billing, and integrations live. PR and paid acquisition begin. |

### 1.2 Competitive Landscape

**Brandboom** — Digital wholesale platform for apparel, accessories, and lifestyle brands. Key strengths: Shopify integration, buyer marketplace (200K+ vetted buyers), personalized presentations, Stripe/PayPal payments. Reports 2–3× higher order conversion rates. Targets independent brands looking for easy digital wholesale.

**JOOR** — Enterprise-grade wholesale B2B platform. Key strengths: 14,000+ brands, 675,000+ buyers across 150 countries, JOOR Pay (embedded payments with net terms), JOOR Passport (digital trade show portal), advanced assortment tools. Targets mid-market to enterprise fashion brands and retailers.

**Threadline's Differentiators:**
- AI-powered insights engine (Stitches) — revenue leakage, order gaps, predictive signals
- Built-in automation agents (custom AI workflows per org)
- Multi-org federation (rep ↔ brand connections with cross-org visibility)
- Commission hierarchy with granular overrides (member → brand → account)
- Field rep-first design (territory management, appointment scheduling, expense tracking)
- Transparent, accessible pricing (Free / Pro / Agency tiers)

### 1.3 Design Inspiration

Ramp.com serves as the design benchmark for Threadline's marketing site:
- Clean, spacious layouts with strong visual hierarchy
- Motion and interaction design for tactility and engagement
- Product-led storytelling (show, don't tell)
- High-quality photography and illustration language
- Component-based design system for speed and consistency
- SEO-optimized content architecture driving organic traffic

---

## 2. Marketing Website

### 2.1 Current State

**Existing Pages (6):**
- `/` — Homepage with hero, stats, features overview, FAQ
- `/features` — 6 core features with descriptions and CTAs
- `/intelligence` — Stitches AI engine marketing page
- `/solutions` — Role-based solutions (Independent Reps, Showroom Owners, Sales Agencies)
- `/pricing` — Three tiers: Free ($0), Pro ($49/mo), Agency ($149/mo)
- `/workspace` — Placeholder ("Coming Soon")

**Existing Assets:**
- MarketingNav component (logo, 4 nav links, auth CTAs)
- MarketingFooter component (minimal)
- Scroll animations via Motion library
- Fonts: IBM Plex Mono, IBM Plex Sans, Instrument Serif
- Tailwind CSS design system

**Known Issues:**
- No Open Graph tags, meta descriptions, or structured data on any page
- No sitemap.xml
- Footer contains placeholder copy unrelated to wholesale positioning
- No blog, help docs, or support pages
- Terms of Service and Privacy Policy are anchor links to `#terms`/`#privacy` (no actual pages)
- Workspace page is a stub

---

### 2.2 Website Pages — Required

#### Navigation Structure

```
Primary Nav:
  Product → [Features, Intelligence, Integrations, Buyer Portal]
  Solutions → [Independent Reps, Showroom Owners, Sales Agencies, Brands]
  Pricing
  Resources → [Blog, Help Center, Getting Started, API Docs]
  
Secondary Nav (top-right):
  Login | Sign Up Free

Footer:
  Product: Features, Intelligence, Integrations, Buyer Portal, Changelog
  Solutions: Independent Reps, Showroom Owners, Sales Agencies, Brands
  Resources: Blog, Help Center, Getting Started, API Docs
  Company: About, Careers, Contact, Press
  Legal: Terms of Service, Privacy Policy, Security
  Social: LinkedIn, Twitter/X, Instagram
```

#### Pages by Priority

**Phase 1 — Early Access (by April 30):**

| Page | Status | Requirements |
|---|---|---|
| Homepage `/` | Needs update | Update hero for Early Access CTA, add social proof section, update footer, fix stats with real/credible numbers |
| Features `/features` | Needs update | Expand to sub-pages per feature. Add product screenshots/mockups. Add comparison table vs competitors |
| Pricing `/pricing` | Exists | Add FAQ, add feature comparison table per tier, add "Contact Sales" for enterprise |
| Early Access Landing `/early-access` | New | Dedicated landing page with waitlist signup, value props, founding member benefits |
| Terms of Service `/legal/terms` | New | Full legal terms page |
| Privacy Policy `/legal/privacy` | New | Full privacy policy page |
| Security `/security` | New | Security practices, SOC 2 roadmap, encryption, SSO, RLS details |

**Phase 2 — Beta Release (by May 30):**

| Page | Status | Requirements |
|---|---|---|
| Blog `/blog` | New | Content hub with categories: Product Updates, Industry Insights, Best Practices, Customer Stories |
| Blog Post Template `/blog/[slug]` | New | Individual post pages with author, date, read time, share buttons, related posts |
| Solutions: Independent Reps `/solutions/independent-reps` | Needs expansion | Dedicated landing page with persona-specific messaging, use cases, testimonials |
| Solutions: Showroom Owners `/solutions/showroom-owners` | Needs expansion | Dedicated landing page |
| Solutions: Sales Agencies `/solutions/sales-agencies` | Needs expansion | Dedicated landing page |
| Solutions: Brands `/solutions/brands` | New | Brand org-specific landing page (product catalog, buyer portal, rep connections) |
| Integrations `/integrations` | New | Integration directory page showing all connections (Google, Slack, Notion, etc.) |
| Integration Detail `/integrations/[slug]` | New | Per-integration page with setup guide, features, screenshots |
| Help Center `/help` | New | Searchable knowledge base with categories |
| Getting Started `/help/getting-started` | New | Step-by-step onboarding guide for new users |
| About `/about` | New | Company story, mission, team, values |
| Contact `/contact` | New | Contact form, email, support hours |
| Changelog `/changelog` | New | Product updates and release notes feed |

**Phase 3 — Full Release (by June 30):**

| Page | Status | Requirements |
|---|---|---|
| Case Studies `/customers/[slug]` | New | Customer success stories with metrics, quotes, before/after |
| Customers Index `/customers` | New | Logo wall, featured stories, industry filter |
| Compare Pages `/compare/[competitor]` | New | Threadline vs Brandboom, Threadline vs JOOR, Threadline vs NuORDER |
| API Documentation `/developers` | New | API reference, authentication, webhooks, SDKs |
| Buyer Portal Marketing `/buyer-portal` | New | Dedicated page marketing the buyer-facing experience |
| Press/Media Kit `/press` | New | Press releases, brand assets, logos, media inquiries |
| Careers `/careers` | New | Job listings (even if future), culture, benefits |
| Webinar/Events `/events` | New | Upcoming webinars, trade shows, recorded sessions |
| ROI Calculator `/roi` | New | Interactive tool: input order volume, reps, brands → see projected savings |

---

### 2.3 Website Technical Requirements

**SEO:**
- [ ] Meta title and description on every page (unique, keyword-targeted)
- [ ] Open Graph tags (og:title, og:description, og:image) on every page
- [ ] Twitter Card tags on every page
- [ ] Structured data / JSON-LD (Organization, Product, FAQ, Article schemas)
- [ ] XML sitemap (`/sitemap.xml`) auto-generated
- [ ] Canonical URLs on all pages
- [ ] Alt text on all images
- [ ] Heading hierarchy audit (single H1 per page)
- [ ] Internal linking strategy between pages
- [ ] Page speed optimization (Core Web Vitals targets)

**Analytics & Tracking:**
- [ ] Google Analytics 4 (or Plausible/Fathom for privacy-first)
- [ ] Google Search Console
- [ ] Event tracking on CTAs (signup, waitlist, demo request)
- [ ] UTM parameter support for campaign tracking
- [ ] Conversion tracking (signup funnel)
- [ ] Heatmapping tool (Hotjar, PostHog, or similar)

**Performance:**
- [ ] Lighthouse score targets: Performance 90+, Accessibility 95+, SEO 95+
- [ ] Image optimization pipeline (WebP/AVIF, lazy loading, responsive srcset)
- [ ] Font subsetting and preloading
- [ ] Edge caching via Vercel
- [ ] Critical CSS inlining

**Legal & Compliance:**
- [ ] Cookie consent banner (GDPR)
- [ ] Terms of Service page (reviewed by legal)
- [ ] Privacy Policy page (reviewed by legal)
- [ ] CCPA compliance if targeting California businesses
- [ ] Accessibility (WCAG 2.1 AA compliance)

---

## 3. Graphic Assets & Brand Design

### 3.1 Brand Identity

**Current State:** Basic brand with logo and font stack. No comprehensive brand guidelines documented.

**Outstanding Requirements:**

- [ ] Brand guidelines document (logo usage, colors, typography, spacing, voice)
- [ ] Logo variations (full, icon-only, monochrome, reversed for dark backgrounds)
- [ ] Color palette formalization (primary, secondary, accent, semantic colors)
- [ ] Typography scale documentation (headings, body, captions, code)
- [ ] Icon library (consistent style for feature icons, navigation, UI)

### 3.2 Marketing Graphics

**Product Screenshots & Mockups:**
- [ ] Hero dashboard screenshot (polished, populated with realistic data)
- [ ] Feature-specific screenshots (orders, insights, buyer portal, agents, reports)
- [ ] Mobile responsive mockups (phone + tablet)
- [ ] Browser mockup frames for marketing pages
- [ ] Before/after comparison graphics (manual process vs Threadline)

**Illustrations & Diagrams:**
- [ ] How it works diagram (Connect → Learn → Act flow)
- [ ] Architecture/federation diagram (Rep Org ↔ Brand Org ↔ Buyer)
- [ ] Integration ecosystem diagram (all connected platforms)
- [ ] Commission hierarchy visualization
- [ ] ROI/value proposition infographics

**Social Media Assets:**
- [ ] LinkedIn banner and profile image
- [ ] Twitter/X header and profile image
- [ ] Instagram profile image and highlight covers
- [ ] Social post templates (product updates, tips, quotes, announcements)
- [ ] Open Graph default share image (1200×630)

**Trade Show / Print:**
- [ ] One-pager / sell sheet (PDF, print-ready)
- [ ] Pitch deck (presentation for investors/partners)
- [ ] Business cards
- [ ] Trade show booth graphics (if applicable)
- [ ] QR code materials linking to signup/demo

**Video:**
- [ ] Product demo video (2–3 min overview)
- [ ] Feature-specific micro-demos (30–60 sec each)
- [ ] Customer testimonial videos (post-beta)
- [ ] Animated explainer (how Threadline works)

---

## 4. Content Strategy

### 4.1 Content Pillars

1. **Product Education** — Feature deep-dives, how-to guides, getting started tutorials
2. **Industry Insights** — Wholesale fashion trends, market data, trade show coverage
3. **Best Practices** — Order management tips, rep productivity, buyer relationship building
4. **Customer Stories** — Case studies, success metrics, testimonials
5. **AI & Innovation** — How AI transforms wholesale, Stitches engine capabilities
6. **Company & Culture** — Team updates, product roadmap, behind-the-scenes

### 4.2 Content Calendar

**Phase 1: Early Access (April 14–30)**

| Week | Content | Channel |
|---|---|---|
| Apr 14–18 | "Introducing Threadline" announcement post | Blog, LinkedIn |
| Apr 14–18 | 3 teaser social posts (features preview) | LinkedIn, Twitter/X, Instagram |
| Apr 21–25 | "Why We Built Threadline" founder story | Blog, LinkedIn |
| Apr 21–25 | Early Access signup landing page live | Website |
| Apr 28–30 | Early Access launch email to waitlist | Email |
| Apr 28–30 | "What's Coming" product roadmap post | Blog |

**Phase 2: Beta (May 1–30)**

| Week | Content | Channel |
|---|---|---|
| Week 1 | "Getting Started with Threadline" guide | Blog, Help Center |
| Week 1 | Feature deep-dive: AI Insights & Stitches | Blog, LinkedIn |
| Week 2 | Comparison: Threadline vs Brandboom vs JOOR | Blog, SEO |
| Week 2 | 5 social posts (tips, features, behind-the-scenes) | LinkedIn, Twitter/X |
| Week 3 | Feature deep-dive: Buyer Portal | Blog |
| Week 3 | Email newsletter #1 to beta users | Email |
| Week 4 | "How [Early User] Saved X Hours/Week" case study | Blog, LinkedIn |
| Week 4 | Beta feedback roundup + what we shipped | Blog, Email |

**Phase 3: Full Launch (June 1–30)**

| Week | Content | Channel |
|---|---|---|
| Week 1 | Full launch announcement + PR outreach | Blog, Email, LinkedIn, Press |
| Week 1 | Product Hunt launch | Product Hunt |
| Week 2 | "Complete Guide to Wholesale Order Management" pillar page | Blog, SEO |
| Week 2 | 3 customer testimonial videos | YouTube, LinkedIn, Website |
| Week 3 | Trade show integration guide | Blog |
| Week 3 | Email sequence: 5-part onboarding drip | Email |
| Week 4 | "State of Wholesale 2026" industry report | Blog, LinkedIn, Email |
| Week 4 | Webinar: "Modernizing Your Wholesale Operation" | Events, YouTube |

### 4.3 Email Marketing

**Sequences to Build:**
- [ ] Waitlist nurture (Early Access period — 3 emails)
- [ ] Welcome/onboarding (new signups — 5 emails over 14 days)
- [ ] Beta feedback request (post-beta — 2 emails)
- [ ] Launch announcement (full release — 1 email blast)
- [ ] Monthly newsletter template (ongoing)
- [ ] Re-engagement sequence (inactive users — 3 emails)

**Email Infrastructure:**
- [ ] Select email platform (Resend, Postmark, SendGrid, or ConvertKit)
- [ ] Design email templates (responsive, on-brand)
- [ ] Set up transactional vs marketing email separation
- [ ] Configure email authentication (SPF, DKIM, DMARC for deliverability)
- [ ] Build signup forms / embed on website

### 4.4 SEO Strategy

**Target Keywords (primary):**
- wholesale order management software
- B2B wholesale platform
- fashion wholesale software
- sales rep management platform
- wholesale order management app
- digital line sheet software
- wholesale CRM for fashion
- commission tracking software wholesale

**Target Keywords (long-tail / comparison):**
- Brandboom alternative
- JOOR alternative
- NuORDER alternative
- wholesale order management for independent reps
- fashion wholesale AI platform
- wholesale buyer portal software

**SEO Content Plan:**
- [ ] Keyword research and mapping (assign primary keyword per page)
- [ ] Competitor backlink analysis (Brandboom, JOOR, NuORDER)
- [ ] Pillar page strategy (1 pillar + 5–10 cluster articles per topic)
- [ ] Internal linking map
- [ ] Monthly content output target: 4–6 blog posts
- [ ] Guest posting / partnership opportunities in fashion trade publications

---

## 5. Help Documentation & Getting Started

### 5.1 Help Center Structure

```
Getting Started
  ├── Creating Your Organization
  ├── Inviting Team Members
  ├── Adding Your First Brand
  ├── Importing Accounts
  ├── Connecting Your Email
  └── Placing Your First Order

Orders
  ├── Creating an Order
  ├── Managing Order Status
  ├── Generating Order PDFs
  ├── Sending Orders via Email
  └── Order Attention Flags

Products & Catalog
  ├── Adding Products Manually
  ├── Using the Linesheet Parser
  ├── Managing Product Variants
  ├── Product Images
  └── Seasons & Collections

Accounts & Buyers
  ├── Creating Accounts
  ├── Bulk Import via CSV
  ├── Territory Assignment
  ├── Managing Buyer Portal Access
  └── Buyer Invitations

Appointments
  ├── Scheduling Appointments
  ├── Appointment Types & Locations
  └── Show Date Management

Expenses
  ├── Submitting Expenses
  ├── Uploading Receipts
  ├── Approval Workflow
  └── Expense Categories

Reports & Insights
  ├── Available Reports
  ├── AI Insights Dashboard
  ├── Daily Briefings
  └── Exporting Data

Integrations
  ├── Gmail Setup
  ├── Google Sheets
  ├── Slack
  ├── Notion
  ├── Discord
  └── Microsoft 365

Team & Settings
  ├── Roles & Permissions
  ├── Brand Scoping
  ├── Commission Configuration
  ├── SSO Setup
  └── Organization Settings

Connections (Multi-Org)
  ├── Connecting to a Brand
  ├── Managing Connection Status
  └── Cross-Org Visibility

AI Agents
  ├── Creating an Agent
  ├── Agent Triggers
  └── Agent Tools & Capabilities
```

### 5.2 Documentation Requirements

- [ ] Write all Getting Started guides (6 articles)
- [ ] Write core module docs (Orders, Products, Accounts — 15 articles)
- [ ] Write supplemental module docs (Appointments, Expenses, Reports — 10 articles)
- [ ] Write integration setup guides (6 articles)
- [ ] Write admin/settings docs (5 articles)
- [ ] Add contextual help links in-app (link to relevant doc from each page)
- [ ] Search functionality in Help Center
- [ ] Video walkthroughs for key workflows (Getting Started, Orders, Insights)
- [ ] Interactive onboarding tooltips in-app

---

## 6. Launch Marketing Channels

### 6.1 Owned Channels

- **Website** — Primary conversion point (signup, demo request)
- **Blog** — SEO and thought leadership
- **Email** — Nurture sequences, newsletters, announcements
- **Social Media** — LinkedIn (primary), Twitter/X, Instagram

### 6.2 Earned Channels

- **Product Hunt** — Full launch day campaign
- **Press/PR** — Fashion trade publications (WWD, Business of Fashion, Sourcing Journal)
- **Guest Posts** — Industry blogs, wholesale/retail publications
- **Trade Shows** — Presence at key fashion trade shows (Magic, Coterie, Atlanta Market)
- **Community** — Reddit (r/wholesale, r/fashion), LinkedIn groups, wholesale forums
- **Word of Mouth** — Referral program for early adopters

### 6.3 Paid Channels (Post-Launch)

- [ ] Google Ads (search campaigns targeting competitor and category keywords)
- [ ] LinkedIn Ads (sponsored content targeting fashion wholesale professionals)
- [ ] Retargeting campaigns (website visitors who didn't convert)
- [ ] Sponsored content in trade publications
- [ ] Podcast sponsorships (fashion/wholesale industry podcasts)

---

## 7. Launch Milestones & Timeline

### Phase 1: Pre-Launch → Early Access (April 12–30)

| Date | Milestone | Deliverables |
|---|---|---|
| Apr 12–16 | Brand & Design Foundation | Brand guidelines doc, logo variations, color/type finalization, OG images |
| Apr 16–20 | Website Updates | Homepage refresh, Early Access landing page, footer fix, SEO basics (meta tags, sitemap), Terms & Privacy pages |
| Apr 20–24 | Content Creation | "Introducing Threadline" blog post, founder story draft, 6 social posts, waitlist email sequence |
| Apr 24–28 | Launch Prep | Analytics setup (GA4, Search Console), email platform configured, social profiles created, product screenshots |
| Apr 30 | **Early Access Launch** | Waitlist opens, first blog posts live, social announcement, Early Access emails sent |

### Phase 2: Early Access → Beta (May 1–30)

| Date | Milestone | Deliverables |
|---|---|---|
| May 1–7 | Content Engine Starts | Getting Started guide, first feature deep-dive, Help Center launched (10 articles) |
| May 7–14 | Solutions Expansion | Dedicated solutions pages (4), integrations directory page, comparison blog posts |
| May 14–21 | Social Proof | First case study, testimonial collection, customer logos for website |
| May 21–28 | Beta Prep | Changelog page, About page, Contact page, blog category pages, 20+ help articles |
| May 30 | **Beta Launch** | Open waitlist, marketing site fully live, beta announcement email + social campaign |

### Phase 3: Beta → Full Release (June 1–30)

| Date | Milestone | Deliverables |
|---|---|---|
| Jun 1–7 | Launch Marketing Prep | Press kit, Product Hunt listing draft, launch email sequence, paid ad creatives |
| Jun 7–14 | Content Blitz | Competitor comparison pages, pillar SEO content, 3 customer videos, webinar prep |
| Jun 14–21 | PR & Outreach | Press outreach to trade publications, influencer/partner outreach, guest post submissions |
| Jun 21–28 | Final Polish | ROI calculator, API docs, careers page, all help docs complete (40+ articles) |
| Jun 30 | **Full Launch** | Product Hunt launch, press release, paid ads go live, full public availability |

---

## 8. Metrics & Success Criteria

### 8.1 Early Access (April 30)

- [ ] Waitlist signups: 100+ emails
- [ ] Early Access users: 20–50 active orgs
- [ ] Website live with 7+ pages, full SEO metadata
- [ ] 2+ blog posts published

### 8.2 Beta (May 30)

- [ ] Waitlist signups: 500+ emails
- [ ] Beta users: 100–200 active orgs
- [ ] Website: 20+ pages live
- [ ] Blog: 8+ posts published
- [ ] Help Center: 20+ articles
- [ ] Social followers: 500+ across platforms
- [ ] Organic search impressions growing week-over-week

### 8.3 Full Launch (June 30)

- [ ] Registered users: 500+ orgs
- [ ] Paid conversions: 50+ Pro/Agency subscriptions
- [ ] Website: 40+ pages live
- [ ] Blog: 15+ posts published
- [ ] Help Center: 40+ articles
- [ ] Product Hunt: Top 5 of the day
- [ ] Press mentions: 3+ trade publications
- [ ] Monthly organic traffic: 5,000+ visits
- [ ] Email list: 2,000+ subscribers

---

## 9. Tools & Infrastructure

### 9.1 Recommended Marketing Stack

| Category | Recommended Tool | Purpose |
|---|---|---|
| Email Marketing | Resend or ConvertKit | Transactional + marketing emails |
| Analytics | Google Analytics 4 + Plausible | Traffic, conversions, privacy-friendly analytics |
| SEO | Google Search Console + Ahrefs/SEMrush | Rankings, keyword tracking, backlinks |
| Social Scheduling | Buffer or Typefully | Schedule posts across platforms |
| Design | Figma | Marketing graphics, social templates |
| Video | Loom + Descript | Product demos, testimonial editing |
| Help Docs | Built-in (SvelteKit) or GitBook | Knowledge base and support docs |
| CRM / Waitlist | Built-in or Loops.so | Waitlist management, lead tracking |
| Heatmaps | PostHog or Hotjar | User behavior on marketing site |
| Feedback | Canny or built-in | Feature requests and feedback collection |

### 9.2 Design System for Marketing

- [ ] Shared component library for marketing pages (Hero, FeatureCard, Testimonial, CTA, ComparisonTable, PricingCard, FAQ)
- [ ] Responsive breakpoint strategy (mobile-first)
- [ ] Animation/motion system documentation (scroll reveals, hover states, transitions)
- [ ] Dark mode support (marketing pages)
- [ ] Consistent spacing, border-radius, and shadow tokens

---

## 10. Open Questions & Considerations

### Brand & Positioning

- [ ] Should Threadline rebrand the AI engine name from "Stitches" or keep it?
- [ ] Is the current footer copy ("protect service members and civilians") a placeholder? Needs replacement with wholesale-relevant mission statement.
- [ ] Should the marketing site support dark mode?
- [ ] Does the current pricing (Free $0 / Pro $49 / Agency $149) reflect market positioning vs Brandboom and JOOR?

### Content & Distribution

- [ ] Should Threadline invest in a podcast or video series for thought leadership?
- [ ] Is there budget for paid acquisition at launch, or is this purely organic/earned?
- [ ] Should the blog be built into SvelteKit or use a headless CMS (Sanity, Contentful, Notion)?
- [ ] Which trade shows should Threadline target for presence in 2026?

### Technical

- [ ] Should the Help Center be built in-app, as a separate subdomain (help.threadline.com), or use a third-party tool?
- [ ] Should marketing pages be statically generated (SSG) for performance, or remain SSR?
- [ ] Is there a need for internationalization (i18n) of the marketing site?
- [ ] Should the Early Access signup use a separate waitlist tool or the existing Supabase auth?

### Launch Strategy

- [ ] Is the April 30 → May 30 → June 30 timeline realistic given current team size?
- [ ] Should there be a referral/invite program for Early Access users?
- [ ] Is a Product Hunt launch the right channel for B2B wholesale, or are trade publications more impactful?
- [ ] Should Threadline offer a lifetime deal or founding member discount for early adopters?

---

*This is a living document. Update as marketing strategy evolves, content is published, and launch milestones are hit.*
