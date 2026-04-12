# Business Requirements Document: Features

**Product:** Threadline
**Version:** 1.0
**Last Updated:** April 12, 2026
**Status:** Living Document
**Related:** [Threadline_Roles_Permissions_BRD.md](./Threadline_Roles_Permissions_BRD.md)

---

## 1. Overview

Threadline is a multi-tenant B2B wholesale order management platform for the fashion and apparel industry. It connects three user types — sales rep organizations, brand organizations, and buyers — enabling order management, product cataloging, commission tracking, and cross-organization collaboration. The platform is built on SvelteKit with Supabase (PostgreSQL, Auth, Storage) and deployed on Vercel.

### 1.1 Organization Types

**Rep Org (default)** — Sales representative agencies that connect to multiple brands, manage buyer accounts, create orders, and track commissions.

**Brand Org** — Brands and manufacturers that own product catalogs. A "self-brand" record is automatically created on org setup. Rep orgs request connections to access brand catalogs.

---

## 2. Feature Inventory

### 2.1 Orders

**Status: Fully Implemented**

The core business module. Orders flow through a defined status lifecycle and support full line-item management, PDF generation, and email delivery.

**Existing Capabilities:**
- Create, view, edit, and delete orders
- Status workflow: Draft → Submitted → Confirmed → Shipped → Delivered → Cancelled
- Line-item editor with style, color, size, quantity, and unit price (auto-calculated totals)
- Order number auto-generation (ORG-XXXXXX format)
- Season, show date, and delivery date assignment per order
- Source type tracking (show, roadshow, direct, email, etc.)
- PDF generation (via pdf-lib) and email sending to account contacts
- Attention flag system for orders needing review
- Commission tracking per order (resolved through commission hierarchy)
- Brand-scoped visibility for Member and Sales roles
- CSV export
- RLS enforcement for multi-tenant data isolation

**Outstanding Features:**
- [ ] **Order vs Note creation flow** — When creating a new entry, the user selects between **Order** or **Note** upfront. This determines the UX flow and required fields:
  - **Order mode:** Full order creation flow as it exists today. Account required, full status lifecycle, all fields available.
  - **Note mode:** Lightweight capture mode for reps who need to record buyer interest quickly (e.g., at a show). Minimal required fields — just a name and line items. Notes cannot progress past Draft status without being promoted to a full Order.
  - **Promote to Order action:** A Note can be converted to an Order, which triggers a guided flow to fill in missing required fields (link/create account, delivery info, etc.).
- [ ] **Fuzzy account search** — Account selection when creating an order should use fuzzy/approximate matching (e.g., typing "ml leddys" surfaces "M.L. Leddy's"). Implement using trigram similarity (`pg_trgm`) or Levenshtein distance for tolerance of abbreviations, missing punctuation, and partial matches.
- [ ] **Freeform name entry (Note mode only)** — In Note mode, the user can enter a freeform buyer/account name not linked to an existing account record. This supports the use case where a rep is capturing what a new prospect wants to order before formally setting up the account. The freeform name is stored on the order and must be resolved to a real account before the Note can be promoted to an Order.
- [ ] Order duplication / cloning
- [ ] Bulk status updates (select multiple orders, change status at once)
- [ ] Order templates (save frequently-used line-item sets as reusable templates)
- [ ] Order revision history / audit trail (track who changed what and when)
- [ ] Partial shipment tracking (split an order across multiple ship dates)
- [ ] Return / credit memo workflow
- [ ] Automated order confirmation emails on status change
- [ ] Order notes and internal comments thread
- [ ] Drag-and-drop line-item reordering

**Open Questions:**
- Should buyers receive automated email notifications when order status changes (e.g., Confirmed, Shipped)?
- Is there a need for order approval workflows where certain order values require Admin/Owner sign-off before submission?
- Should orders support attachments beyond the generated PDF (e.g., spec sheets, custom notes)?
- Should Notes have their own list/filter view separate from Orders, or should they appear together with a type filter?
- Should Notes support a simplified line-item entry (e.g., just style + quantity, no pricing required)?
- When promoting a Note to an Order, should the system suggest matching accounts based on the freeform name?

---

### 2.2 Products & Catalog

**Status: Fully Implemented**

Product catalog management with variants, images, pricing, and AI-powered linesheet parsing.

**Existing Capabilities:**
- Full product CRUD with style number, wholesale price, retail price, and category
- Product variants (color, size, SKU, barcode, price overrides)
- Image gallery with primary image flag
- Season assignment
- AI-powered linesheet parser (Claude Vision — extracts products from PDF/image uploads)
- Cross-org product visibility (reps see connected brand catalogs)
- Product import into order line items

**Outstanding Features:**
- [ ] Product search and filtering within catalog (by category, season, price range)
- [ ] Product availability / inventory tracking (in-stock, low-stock, out-of-stock)
- [ ] Product tags and custom attributes
- [ ] Bulk product import via CSV/Excel
- [ ] Bulk product edit (update prices across multiple products at once)
- [ ] Product archiving (soft delete without losing historical order data)
- [ ] Size scale / size run templates (e.g., S-M-L-XL presets)
- [ ] Style velocity surfaced in UI (function exists in DB: `get_style_velocity`)
- [ ] Product comparison view for buyers

**Open Questions:**
- Should products support multiple price tiers (e.g., wholesale, key account, closeout)?
- Is there a need for a product lifecycle status (active, discontinued, pre-order)?
- Should the linesheet parser support batch processing of multiple files at once?

---

### 2.3 Brands

**Status: Fully Implemented**

Brand entity management with logos, assets, contact information, and commission configuration.

**Existing Capabilities:**
- Create, view, edit, and delete brands
- Logo upload and management
- Brand assets storage (marketing materials)
- Contact information
- Commission rate configuration per brand
- Scoped member access (Admin can restrict members to specific brands)
- `is_self_brand` flag for brand orgs' own brand record
- Brand-scoped visibility across all modules

**Outstanding Features:**
- [ ] Brand profile page (public-facing brand information for connected reps)
- [ ] Brand-level document library (catalogs, line sheets, terms, policies)
- [ ] Brand onboarding checklist (guide new brands through setup steps)
- [ ] Brand performance dashboard (sales, top accounts, territory breakdown)
- [ ] Brand settings for order requirements (minimum order value, pack sizes, lead times)

**Open Questions:**
- Should brands have configurable order terms (payment terms, cancellation policies) visible on orders?
- Is there a need for brand-level notifications when new connections or orders come in?

---

### 2.4 Accounts (Buyer Management)

**Status: Fully Implemented**

Buyer account management with territories, contacts, and health scoring infrastructure.

**Existing Capabilities:**
- Create, edit, and delete accounts
- Address and contact information (first name, last name, email, phone)
- Territory assignment
- Bulk import/export via CSV
- Account health scoring infrastructure (DB-level, based on order frequency, recency, revenue)
- Brand-scoped visibility for Member and Sales roles

**Outstanding Features:**
- [ ] Account health score surfaced in UI (infrastructure exists but not displayed)
- [ ] Account activity timeline (orders, appointments, emails, notes in one feed)
- [ ] Account segmentation and tagging (VIP, at-risk, new, etc.)
- [ ] Account hierarchy (parent/child relationships for multi-location buyers)
- [ ] Account-level notes and internal comments
- [ ] Account merge tool (combine duplicate records)
- [ ] Account-level document storage (contracts, terms, credit applications)
- [ ] Map view of accounts by territory

**Open Questions:**
- Should account health scoring be configurable per org (custom thresholds, weights)?
- Is there a need for account credit limits or payment terms tracking?
- Should the system flag potential duplicate accounts during creation?

---

### 2.5 Appointments & Scheduling

**Status: Fully Implemented**

Appointment scheduling for sales meetings with accounts, linked to shows and brands.

**Existing Capabilities:**
- Create, view, edit, and delete appointments
- Location types: show, road, phone, video, other
- Appointment types: scheduled, walk-in
- Status tracking (pending, confirmed, completed)
- Real-time upcoming appointment count polling
- Show date and brand association
- Brand-scoped visibility

**Outstanding Features:**
- [ ] Calendar view (day/week/month visual calendar, not just list)
- [ ] Calendar sync (Google Calendar, Outlook Calendar — push/pull)
- [ ] Appointment reminders (email or push notification before meeting)
- [ ] Appointment recurrence (weekly, monthly recurring meetings)
- [ ] Meeting notes and follow-up action items attached to appointments
- [ ] Buyer self-scheduling (buyers book their own appointments via a shared link)
- [ ] Appointment duration tracking and time-slot management
- [ ] Travel time estimation between in-person appointments

**Open Questions:**
- Should appointments support video conferencing links (Zoom, Teams, Google Meet) auto-generation?
- Is there a need for appointment check-in tracking at shows (confirm buyer actually attended)?
- Should reps be able to share availability windows for buyers to self-book?

---

### 2.6 Expenses

**Status: Fully Implemented**

Brand expense tracking with receipt uploads, approval workflows, and categorization.

**Existing Capabilities:**
- Create, view, edit, and delete expenses
- Status workflow: Draft → Submitted → Approved → Rejected
- Categories: trade show, samples, marketing, travel, meals, shipping, photography, office, other
- Expense number auto-generation (EXP-ORG-XXXXX)
- Receipt upload via signed tokens (Supabase Storage)
- Approval flow (Admin/Owner reviews and approves/rejects)
- CSV export
- Brand-scoped visibility

**Outstanding Features:**
- [ ] Expense reporting summaries (totals by category, brand, time period)
- [ ] Expense budgets per brand (set limits, track spending against budget)
- [ ] Rejection reason / comments on approval workflow
- [ ] Expense duplication for recurring expenses
- [ ] Multi-receipt support per expense (currently one receipt per expense)
- [ ] Mileage tracking for travel expenses
- [ ] Integration with QuickBooks/Xero for accounting sync

**Open Questions:**
- Should expense approvals support multi-level approval (e.g., Manager → Finance)?
- Is there a need for expense policies (auto-flag expenses over a threshold)?
- Should rejected expenses be editable and re-submittable?

---

### 2.7 Email Integration

**Status: Fully Implemented**

Gmail integration with inbox sync, compose, thread view, and contact discovery.

**Existing Capabilities:**
- Gmail OAuth (full read/write access)
- Inbox sync with pagination
- Email compose and send via Gmail API
- Thread view
- Contact auto-discovery from inbox (extract sender/recipient emails)
- Email activity logging with entity linking (related_type / related_id for orders, accounts)
- System email filtering (noreply@, notifications@, etc.)
- Unread message count tracking

**Outstanding Features:**
- [ ] Microsoft Outlook full integration (OAuth configured but sync not fully wired)
- [ ] Email templates (save reusable email templates for common messages)
- [ ] Email scheduling (send later)
- [ ] Email tracking (open rates, click tracking)
- [ ] Automatic email-to-account/order linking (suggest associations based on contact)
- [ ] Bulk email sending (select multiple accounts, send branded communications)
- [ ] Email signature management
- [ ] Email attachment handling (save attachments to entities)

**Open Questions:**
- Should email integration support shared team inboxes (one inbox visible to multiple members)?
- Is there a need for email sequences / drip campaigns to buyers?
- Should the contact discovery feature auto-create account records from discovered contacts?

---

### 2.8 Insights & Intelligence

**Status: Fully Implemented**

AI-powered insights engine that surfaces actionable recommendations based on order and account data.

**Existing Capabilities:**
- Revenue leakage detection (accounts that ordered last year but not this year)
- Order gap detection (accounts with unusually long gaps between orders)
- Call queue (upcoming appointments needing preparation)
- Overdue order detection (orders stuck in draft/submitted beyond threshold)
- Priority scoring (0–100 scale for sorting insights by importance)
- Insight status management: active → dismissed / acted / expired
- Manual refresh endpoint
- Daily AI briefing generation (pipeline, recent orders, upcoming shows, stale drafts, at-risk accounts)

**Outstanding Features:**
- [ ] Style velocity surfaced in insights (function exists: `get_style_velocity`, not in UI)
- [ ] Trend visualizations (charts showing sales trends, seasonal patterns)
- [ ] Predictive analytics (forecast next quarter revenue, identify growth opportunities)
- [ ] Insight notifications (push high-priority insights via email or Slack)
- [ ] Goal tracking (set revenue targets, track progress)
- [ ] Custom insight rules (org-configurable thresholds and alert types)
- [ ] Competitive intelligence (market positioning data, if available)
- [ ] Insight history and analytics (track which insights led to action)

**Open Questions:**
- Should insights be scheduled for auto-refresh (daily cron) or remain manual-only?
- Is there a need for team-level insights (aggregate across all reps)?
- Should the AI briefing be deliverable via email each morning?

---

### 2.9 Shows & Events

**Status: Fully Implemented**

Trade show management with series templates, date instances, and document storage.

**Existing Capabilities:**
- Show series templates (reusable show definitions)
- Show dates (specific year/month instances of a show)
- Show visit tracking (which accounts attended which shows)
- Show date documents (linesheets, catalogs — file attachments)
- Show-linked orders and appointments

**Outstanding Features:**
- [ ] Show performance dashboard (revenue generated per show, ROI tracking)
- [ ] Show planning tools (booth assignments, staff scheduling)
- [ ] Show-specific buyer invitations (invite accounts to upcoming shows)
- [ ] Post-show follow-up workflow (auto-generate tasks for reps after show ends)
- [ ] Show cost tracking (link expenses to specific shows for ROI calculation)
- [ ] Show attendance analytics (compare attendance and order volume across shows)

**Open Questions:**
- Should shows support public registration pages where buyers can RSVP?
- Is there a need for show floor maps or booth assignment management?
- Should show visits automatically create appointment records?

---

### 2.10 Connections & Federation

**Status: Partially Implemented (DB infrastructure complete, UI minimal)**

Cross-organization connections enabling rep orgs and brand orgs to collaborate.

**Existing Capabilities:**
- Rep org → Brand org connection request flow (pending → active → suspended → disconnected)
- Commission rate per connection
- Brand shareable invite codes (with expiry and max uses)
- Cross-org order visibility (federated_order_links table)
- Cross-org account visibility (federated_account_links table)
- RLS policies for federation data isolation
- Connected reps can see brand product catalogs

**Outstanding Features:**
- [ ] Full connection management UI (currently basic)
- [ ] Connection dashboard (view all connected orgs, status, activity summary)
- [ ] Connection-level permissions (granular control over what data is shared)
- [ ] Federated reporting (brand sees aggregated sales data from connected reps)
- [ ] Connection activity feed (recent orders, new accounts from connected orgs)
- [ ] Automated connection notifications (new order placed, account added)
- [ ] Connection analytics (performance comparison across connected reps)
- [ ] Bulk connection management (approve/suspend multiple connections)

**Open Questions:**
- Should brands be able to set product-level visibility per connection (share some products but not others)?
- Is there a need for connection-level commission overrides separate from brand-level?
- Should federated order links be real-time or batch-synced?

---

### 2.11 Buyer Portal

**Status: Fully Implemented**

Separate buyer-facing experience for browsing products and placing orders.

**Existing Capabilities:**
- Separate buyer login flow (via buyer_invitations, distinct from org invitations)
- Account-scoped brand browsing (buyer sees only brands their account has access to)
- Product catalog with detail views
- Shopping cart (Svelte store — client-side)
- Checkout flow (creates order linked to buyer account)
- Buyer dashboard (recent orders, brand count, active order count)

**Outstanding Features:**
- [ ] Order history with status tracking for buyers
- [ ] Buyer re-order (copy a previous order to cart)
- [ ] Buyer wishlist / favorites
- [ ] Buyer account profile self-management
- [ ] Product search and filtering within buyer portal
- [ ] Buyer-facing order PDF download
- [ ] Multi-user buyer accounts (multiple people at a buyer org can log in)
- [ ] Buyer notifications (order status updates via email)
- [ ] Buyer-facing price sheets / catalogs per brand
- [ ] Server-side cart persistence (cart currently lost on browser close)

**Open Questions:**
- Should buyers be able to request quotes instead of placing orders directly?
- Is there a need for buyer-specific pricing (negotiated prices per account)?
- Should the buyer portal support a "request access to brand" flow for discovering new brands?

---

### 2.12 Reports

**Status: Fully Implemented (pre-built); Custom Reports planned**

Pre-built report templates covering sales, commissions, pipeline, and show performance.

**Existing Capabilities:**
- Sales by Brand (revenue + order count)
- Sales by Account (revenue + order count)
- Sales by Territory (revenue + order count + account count)
- Sales by Rep (revenue + order count by creator)
- Commission Report (calculated from commission hierarchy)
- Pipeline Report (draft, submitted, confirmed counts and amounts)
- Season Comparison (year-over-year sales)
- Show Performance (sales per show date)
- Year selection filtering on all reports
- CSV export for all reports
- Brand-scope and sales-rep-scope filtering

**Outstanding Features:**
- [ ] Custom report builder (choose metrics, filters, groupings — UI shows "Coming Soon")
- [ ] Report scheduling (auto-generate and email reports on a recurring basis)
- [ ] Report sharing (generate shareable links or PDFs of reports)
- [ ] Dashboard with report widgets (pin favorite reports to a home dashboard)
- [ ] Data visualization (charts, graphs embedded in reports)
- [ ] Drill-down capability (click a brand total to see individual orders)
- [ ] Comparison reports (compare two time periods, two reps, two territories)

**Open Questions:**
- Should reports support saved views (save a filtered report configuration for quick access)?
- Is there a need for brand-org-facing reports (brands see aggregated data from connected reps)?
- Should the custom report builder support calculated fields and formulas?

---

### 2.13 Integrations

**Status: Partially Implemented (5 live, 4 planned)**

Third-party service connections for data export, notifications, and sync.

**Implemented Integrations:**
- **Google Sheets** — OAuth, export orders/accounts/brands/expenses to sheets
- **Slack** — OAuth, notification sending, incoming webhooks
- **Notion** — OAuth, database listing, two-way sync
- **Discord** — OAuth, webhook notifications
- **Microsoft 365** — OAuth, Excel export, Teams webhook support (Outlook sync partial)

**Planned Integrations (marked "Coming Soon" in UI):**
- [ ] **QuickBooks** — Sync orders and commissions to accounting
- [ ] **Xero** — Export invoices and track payments
- [ ] **Shopify** — Import orders and inventory data
- [ ] **Zapier** — Connect to thousands of apps via automation recipes

**Outstanding Features:**
- [ ] Integration activity dashboard (view sync history, errors, last sync time)
- [ ] Webhook management (create custom outbound webhooks for events)
- [ ] Integration-level permissions (control which data each integration can access)
- [ ] Full Microsoft Outlook sync (email read/write parity with Gmail)
- [ ] Bi-directional sync for all platforms (currently mostly one-way export)

**Open Questions:**
- Should integrations support field mapping (customize which Threadline fields map to which external fields)?
- Is there a need for an integration marketplace or app directory?
- Should integration errors trigger admin notifications?

---

### 2.14 AI Agents & Automation

**Status: Partially Implemented (event triggers work, scheduled triggers pending)**

Custom AI agents that can be configured per organization with triggers and tool access.

**Existing Capabilities:**
- Agent creation with custom name, slug, system prompt, and icon
- Agent activation toggle (is_active)
- Event-based triggers (fire agent on specific platform events)
- Agent run history and status tracking
- AI tool execution system (create_brand, update_brand, create_account, create_order, add_order_lines, draft_email, send_email, search_emails, query_data, archive_entity)
- Multi-org agent context (agents know if org is rep vs brand type)
- Anthropic Claude integration for agent reasoning

**Outstanding Features:**
- [ ] Scheduled triggers via cron (UI shows "Coming Soon")
- [ ] Agent performance analytics (success rate, actions taken, errors)
- [ ] Agent marketplace / templates (pre-built agent configs for common workflows)
- [ ] Agent testing sandbox (dry-run an agent without affecting live data)
- [ ] Agent chaining (one agent triggers another)
- [ ] Agent access controls (limit which tools an agent can use)
- [ ] Agent logs visible in UI (currently tracked in DB but limited UI exposure)
- [ ] Natural language agent configuration (describe what you want, AI generates the config)

**Open Questions:**
- Should agents be able to interact with third-party integrations (e.g., post to Slack, create Notion pages)?
- Is there a need for agent approval workflows (human-in-the-loop before agent takes action)?
- Should agents have a token/cost budget to prevent runaway execution?

---

### 2.15 Text Message (SMS) AI Ordering

**Status: Not Implemented**

AI-powered order placement and management via SMS text messaging, enabling buyers and reps to interact with Threadline through natural language text messages.

**Outstanding Features:**
- [ ] Inbound SMS number per org (e.g., Twilio, Vonage)
- [ ] AI-powered natural language order parsing ("I need 24 units of Style #4012 in S/M/L")
- [ ] Order confirmation and status check via text
- [ ] Product lookup and availability queries
- [ ] Reorder support based on order history
- [ ] Multi-turn conversation handling (clarifications, quantity adjustments)
- [ ] Phone number provisioning and management per org
- [ ] Rate limiting and spam protection
- [ ] Opt-in/opt-out compliance (TCPA)
- [ ] Message logging and audit trail
- [ ] Fallback to human rep when AI confidence is low

**Open Questions:**
- Should this be a dedicated phone number per org or a shared short code?
- MMS support for sending line sheets or order confirmations as images/PDFs?
- Should reps also be able to place orders on behalf of buyers via SMS?
- International SMS support needed?

---

### 2.16 Email AI Ordering

**Status: Not Implemented**

AI-powered order placement via inbound email, enabling buyers to place and manage orders by emailing free-form requests or PO attachments.

**Outstanding Features:**
- [ ] Dedicated inbound email address per org (e.g., orders@{org}.threadline.systems)
- [ ] AI-powered email parsing: extract order details from free-form emails, PO attachments, line sheet markups
- [ ] Automatic order creation from parsed email content
- [ ] Confirmation email with order summary, line items, and edit link
- [ ] PO document attachment parsing (PDF via Claude Vision, Excel via programmatic extraction)
- [ ] Reply-based order modifications ("Change the M quantity to 12")
- [ ] Status inquiry responses ("What's the status of my last order?")
- [ ] Thread tracking (group related emails into a single order conversation)
- [ ] Integration with existing Gmail integration for rep-side visibility
- [ ] Spam filtering and sender verification
- [ ] Audit trail of all email-to-order conversions

**Open Questions:**
- Should each org get a custom email subdomain or use a shared domain with routing?
- How to handle ambiguous orders (partial SKUs, missing sizes)?
- Should the system auto-create orders or stage them as drafts for rep review?
- CC/BCC support for keeping reps in the loop?

---

### 2.17 Contacts

**Status: Fully Implemented**

Contact management with auto-discovery from email integration.

**Existing Capabilities:**
- Contact list with import/export
- Contact detail view and editing
- Auto-discovery from Gmail inbox (extract contacts from email headers)
- Contact status: discovered, saved, archived
- System email filtering (skip noreply, notifications, etc.)

**Outstanding Features:**
- [ ] Contact enrichment (auto-populate company, role, LinkedIn from email address)
- [ ] Contact activity timeline (emails, orders, appointments involving this contact)
- [ ] Contact deduplication tool
- [ ] Contact groups and tagging
- [ ] Contact-to-account auto-linking (match contacts to existing accounts by domain)

**Open Questions:**
- Should contacts support multiple email addresses and phone numbers?
- Is there a need for contact scoring (engagement level, responsiveness)?

---

### 2.18 Territories

**Status: Fully Implemented**

Territory definitions for organizing accounts by geography or segment.

**Existing Capabilities:**
- Create, edit, and delete territories
- Assign accounts to territories
- Territory-based report filtering (Sales by Territory report)

**Outstanding Features:**
- [ ] Territory map visualization (geographic boundaries on a map)
- [ ] Territory assignment rules (auto-assign accounts based on zip code or state)
- [ ] Territory performance comparison dashboard
- [ ] Territory transfer tool (bulk reassign accounts between territories)
- [ ] Multi-rep territory sharing (assign multiple reps to one territory)

**Open Questions:**
- Should territories support hierarchical nesting (regions → territories → sub-territories)?
- Is there a need for territory-level revenue targets and tracking?

---

### 2.19 Billing & Subscription

**Status: Stub Implementation (UI only, no payment processing)**

Pricing page and billing UI exist but all payment functionality is disabled.

**Existing Capabilities:**
- Billing page with plan display (pricing tiers visible)
- Plan comparison UI
- Invoices section (empty state)

**Outstanding Features:**
- [ ] Payment processor integration (Stripe or equivalent)
- [ ] Plan upgrade/downgrade flow
- [ ] Usage-based billing metering
- [ ] Invoice generation and history
- [ ] Payment method management (credit card, ACH)
- [ ] Free trial management
- [ ] Plan-gated feature enforcement (limit features by plan tier)
- [ ] Seat-based pricing (charge per team member)
- [ ] Annual vs monthly billing toggle

**Open Questions:**
- Which payment processor will be used (Stripe, Paddle, etc.)?
- What defines each plan tier — feature gating, usage limits, seat counts, or a combination?
- Should there be a free tier or only a free trial?
- Is there a need for per-org billing or per-seat billing?

---

### 2.20 Search

**Status: Fully Implemented**

Global search across primary entities.

**Existing Capabilities:**
- Global search (brands, accounts, orders, contacts)
- ILIKE pattern matching
- Context-aware results (shows parent type and parent name)

**Outstanding Features:**
- [ ] Full-text search (move beyond ILIKE to Postgres full-text or dedicated search engine)
- [ ] Search result previews (show snippet of matching data)
- [ ] Recent searches history
- [ ] Saved searches / filters
- [ ] Search within modules (e.g., search only within orders)
- [ ] Keyboard shortcut for search (Cmd+K / Ctrl+K)

**Open Questions:**
- Is the current ILIKE search performant enough at scale, or is a dedicated search index needed?
- Should search support advanced syntax (e.g., `brand:Nike status:confirmed`)?

---

### 2.21 Voice Features

**Status: Partially Implemented**

Voice input/output capabilities powered by ElevenLabs.

**Existing Capabilities:**
- Text-to-speech (ElevenLabs integration, voice synthesis endpoint)
- Speech-to-text endpoint exists (implementation incomplete)

**Outstanding Features:**
- [ ] Complete speech-to-text implementation
- [ ] Voice-powered search (speak a query, get results)
- [ ] Voice notes on orders, accounts, and appointments
- [ ] AI briefing audio playback (listen to daily briefing)
- [ ] Voice commands for hands-free operation

**Open Questions:**
- What is the primary use case for voice — field reps in the car, trade show floor, or something else?
- Should voice notes be transcribed and searchable?

---

### 2.22 Workspace

**Status: Not Implemented (placeholder page)**

A workspace concept exists in routing but has no functional content.

**Existing Capabilities:**
- Route exists at `/workspace` with a "Coming Soon" label

**Outstanding Features:**
- [ ] Define workspace purpose and requirements
- [ ] Design and build workspace functionality

**Open Questions:**
- What is the intended purpose of the Workspace page — a customizable home dashboard, a project board, or something else?
- Should this replace or augment the existing insights dashboard?

---

### 2.23 Onboarding

**Status: Fully Implemented (basic flow)**

Initial setup flow for new organizations.

**Existing Capabilities:**
- Organization creation flow
- Org type selection (rep vs brand)
- Redirect to app after setup

**Outstanding Features:**
- [ ] Guided onboarding wizard (step-by-step setup: add brands, invite team, connect email)
- [ ] Onboarding checklist / progress bar
- [ ] Sample data option (pre-populate with demo data to explore)
- [ ] Interactive product tour (highlight key features on first login)
- [ ] Role-specific onboarding (different flows for Admin vs Sales vs Buyer)

**Open Questions:**
- Should onboarding include a "connect your email" step to drive Gmail/Outlook integration adoption?
- Is there a need for a "getting started" video or walkthrough?

---

### 2.24 Security & SSO

**Status: Fully Implemented**

SAML SSO support with org-level enforcement.

**Existing Capabilities:**
- SAML SSO provider configuration per organization
- SSO enforcement toggle (require SSO for all org members)
- Domain-based SSO discovery
- SSO provider management (add, edit, remove providers)

**Outstanding Features:**
- [ ] SCIM provisioning (auto-sync team members from identity provider)
- [ ] Multi-factor authentication (2FA/MFA beyond SSO)
- [ ] Audit log (track login events, permission changes, data access)
- [ ] Session management (view active sessions, force logout)
- [ ] IP allowlisting (restrict access by IP range)
- [ ] Data export / right to deletion (GDPR compliance tools)

**Open Questions:**
- Is SCIM provisioning a requirement for enterprise customers?
- Should the audit log be accessible to Admins, Owners, or both?
- Is there a compliance requirement for data residency (EU, US, etc.)?

---

## 3. Cross-Cutting Concerns

### 3.1 Notifications System

**Status: Not Implemented**

No centralized notification system exists. Individual features handle their own communication (email sending for orders, Slack for integrations).

**Outstanding Features:**
- [ ] In-app notification center (bell icon with notification feed)
- [ ] Email notification preferences (per-user, per-event-type opt-in/out)
- [ ] Push notifications (browser or mobile)
- [ ] Notification routing rules (send order updates to Slack, expense approvals via email)
- [ ] @mentions in notes and comments
- [ ] Digest notifications (daily/weekly summary email)

---

### 3.2 Mobile Experience

**Status: Not Implemented**

The application is web-only with no mobile-specific optimization documented.

**Outstanding Features:**
- [ ] Responsive design audit and improvements
- [ ] Progressive Web App (PWA) support
- [ ] Mobile-optimized views for key workflows (orders, appointments, expenses)
- [ ] Offline support for field reps (view accounts and products without connectivity)
- [ ] Mobile barcode/QR scanning for products

---

### 3.3 Data Import/Export

**Status: Partially Implemented**

CSV export exists across most modules. Import is limited.

**Existing Capabilities:**
- CSV export for orders, accounts, brands, expenses, reports
- CSV bulk import for accounts
- Google Sheets export via integration
- Excel export via Microsoft 365 integration

**Outstanding Features:**
- [ ] CSV import for orders, products, and contacts
- [ ] Excel file import (direct .xlsx upload)
- [ ] Data migration tools (import from competing platforms)
- [ ] Scheduled exports (auto-export to Google Sheets or email on a schedule)
- [ ] API for programmatic data access

---

### 3.4 Real-Time & Collaboration

**Status: Minimal**

Limited real-time features exist (appointment count polling, unread email count).

**Outstanding Features:**
- [ ] Real-time updates via Supabase Realtime (live order status changes, new insights)
- [ ] Multi-user collaboration indicators (see who else is viewing an order)
- [ ] Activity feed per entity (real-time log of changes)
- [ ] Team chat or comments on entities

---

## 4. Technical Debt & Infrastructure

### 4.1 Testing

**Existing:** Vitest tests for account health, Gmail parsing, insights engine, cart, preferences, CSV utilities.

**Outstanding:**
- [ ] End-to-end test suite (Playwright or Cypress)
- [ ] API endpoint integration tests
- [ ] RLS policy test coverage
- [ ] Component unit tests for critical UI flows

### 4.2 Observability

**Existing:** Sentry error tracking.

**Outstanding:**
- [ ] Application performance monitoring (APM)
- [ ] Custom metrics and dashboards (order volume, API latency, error rates)
- [ ] Structured logging
- [ ] Uptime monitoring and alerting

### 4.3 Performance

**Outstanding:**
- [ ] Database query optimization audit
- [ ] Image optimization pipeline (thumbnails, lazy loading, CDN)
- [ ] API response caching strategy
- [ ] Bundle size optimization and code splitting audit

---

## 5. Feature Readiness Summary

| Feature | Status | Notes |
|---|---|---|
| Orders | ✅ Complete | Core workflow fully functional |
| Products & Catalog | ✅ Complete | Includes AI linesheet parser |
| Brands | ✅ Complete | Scoping and commission config working |
| Accounts | ✅ Complete | Health scoring in DB, not yet in UI |
| Appointments | ✅ Complete | No calendar view yet |
| Expenses | ✅ Complete | Approval workflow functional |
| Email Integration | ✅ Complete | Gmail only; Outlook partial |
| Insights | ✅ Complete | AI briefing and action cards |
| Shows & Events | ✅ Complete | Document storage and visit tracking |
| Contacts | ✅ Complete | Gmail auto-discovery working |
| Territories | ✅ Complete | Basic assignment and reporting |
| Reports | ✅ Complete | 8 pre-built templates; custom builder planned |
| Search | ✅ Complete | ILIKE-based global search |
| Buyer Portal | ✅ Complete | Shopping cart is client-side only |
| SMS AI Ordering | 🔴 Not Started | AI-powered order placement via text message |
| Email AI Ordering | 🔴 Not Started | AI-powered order placement via inbound email |
| Connections | ⚠️ Partial | DB infrastructure complete; UI minimal |
| AI Agents | ⚠️ Partial | Event triggers work; scheduled triggers pending |
| Integrations | ⚠️ Partial | 5 live; 4 planned (QuickBooks, Xero, Shopify, Zapier) |
| Voice | ⚠️ Partial | TTS works; STT endpoint is a stub |
| Security & SSO | ✅ Complete | SAML SSO with enforcement |
| Billing | 🔴 Stub | UI only; no payment processing |
| Workspace | 🔴 Placeholder | Route exists; no functionality |
| Notifications | 🔴 Not Started | No centralized system |
| Mobile | 🔴 Not Started | No mobile optimization |

---

## 6. Open Questions & Feature Considerations

### Platform-Level

- [ ] What is the go-to-market priority order for outstanding features?
- [ ] Should Threadline support a public API for third-party developers?
- [ ] Is white-labeling a requirement (allow orgs to customize branding)?
- [ ] What is the data retention policy for orders, emails, and agent runs?
- [ ] Should there be an admin panel for Threadline platform operators (super-admin)?

### Revenue & Billing

- [ ] What features define each pricing tier?
- [ ] Should integrations be gated by plan (e.g., Slack on Pro, QuickBooks on Enterprise)?
- [ ] Is there a per-seat or per-order pricing component?

### Scalability

- [ ] What is the expected organization count and orders-per-org volume at scale?
- [ ] Should the federation model support many-to-many brand-to-rep relationships at scale?
- [ ] Is there a need for data partitioning or multi-region deployment?

### Compliance

- [ ] Are there industry-specific compliance requirements (e.g., California AB5 for sales reps)?
- [ ] Is SOC 2 or ISO 27001 certification on the roadmap?
- [ ] Does the platform need to support GDPR data subject access requests?

---

*This is a living document. Update as features are built, requirements change, or new questions arise.*
