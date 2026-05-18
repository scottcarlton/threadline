# Stitch-Assisted Brand Onboarding

**Date:** 2026-05-17
**Status:** Draft
**Implementation note:** The wizard is a scripted step-form rendered inside the AI dock — not a conversational AI flow. No AI tokens are consumed. The step form uses the same visual language as the dock (dark containers, numbered option buttons) but all questions and save logic are deterministic. The spec's original "Stitch walks through each section" language describes the UX feel, not the technical implementation.
**Scope:** Brand orgs only. Rep org onboarding is out of scope.

## Problem

After a brand org is created (via the existing 6-step onboarding wizard), the org still needs operational settings configured and data seeded before it can process orders. Today there's no guided path — users have to discover and navigate 14+ settings pages on their own.

## Solution

The `/insight` page surfaces a setup checklist showing what's done and what's not. Users choose between two paths:

- **Use Stitch** — fires a prompt to the AI chat panel. Stitch walks through each incomplete section one question at a time, saving answers directly to the database.
- **Manual** — links to the relevant `/organization/*` settings page for each section.
- **Contact us** — reach out for help.

The user can navigate freely around the app at any time. The checklist is informational, not blocking — but orders cannot be created until required settings are in place.

## Architecture

### Completion Engine

A single server function `getSetupStatus(orgId)` returns per-section completion status. Used by both the insight page checklist and the Stitch system prompt. One source of truth — no drift between what the page shows and what Stitch knows.

```typescript
type SetupStatus = {
	address: boolean;
	shipping: boolean;
	payments: boolean;
	orders: boolean;
	taxes: boolean;
	returns: boolean;
	profile: boolean;
	products: boolean;
	accounts: boolean;
	members: boolean;
};
```

### Completion Rules

**Required (blocks order creation):**

| Section  | Complete when                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Address  | `address_line1`, `city`, `state`, `zip` are populated                                                                                                                                  |
| Shipping | At least one shipping method exists AND default is set AND ship-from address resolved (either `shipping_use_business_address=true` with valid org address, or custom ship-from filled) |
| Payments | `default_payment_terms` is set                                                                                                                                                         |

**Optional (gateway question — "no" marks complete):**

| Section | Complete when                                                          |
| ------- | ---------------------------------------------------------------------- |
| Orders  | Explicitly saved OR declined in `org_setup_status`                     |
| Taxes   | Any tax system enabled with rate OR declined in `org_setup_status`     |
| Returns | `returns_window_days` explicitly set OR declined in `org_setup_status` |

**Profile:**

| Section | Complete when                                                         |
| ------- | --------------------------------------------------------------------- |
| Profile | `address_line1`, `city`, `state`, `zip` populated AND `time_zone` set |

Note: Address and Profile overlap — completing the address step in Phase 1 also satisfies the Profile completion check. Profile shows separately on the checklist per the wireframe but doesn't require a separate Stitch step.

**Seed data (recommended, not blocking):**

| Section  | Complete when                                                            |
| -------- | ------------------------------------------------------------------------ |
| Products | At least one product exists for the org                                  |
| Accounts | At least one account exists for the org                                  |
| Members  | At least one additional member invited OR declined in `org_setup_status` |

### New Database Table: `org_setup_status`

Tracks sections the user explicitly skipped/declined. Distinguishes "not done yet" from "not applicable."

```sql
create table org_setup_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  section text not null,
  status text not null default 'pending', -- 'pending', 'completed', 'skipped'
  updated_at timestamptz not null default now(),
  unique(organization_id, section)
);

-- RLS: same org-scoped policy as other org tables
alter table org_setup_status enable row level security;
create policy "org members can view own org setup status"
  on org_setup_status for select using (
    organization_id in (select organization_id from memberships where user_id = auth.uid())
  );
create policy "org members can manage own org setup status"
  on org_setup_status for all using (
    organization_id in (select organization_id from memberships where user_id = auth.uid())
  );
```

### Auto-Seed Shipping Methods

When a brand org is created, seed three default shipping methods:

- Ground (flat rate, 5–7 business days)
- Express (flat rate, 2–3 business days)
- Overnight (flat rate, 1 business day)

Cost amounts left null — Stitch or the user sets them during setup. This way the shipping step is about confirming/adjusting defaults, not building from scratch.

### New AI Tools

Stitch already has tools for products (`add_product`), accounts (`create_account`), and brands (`update_brand`). New tools needed for org-level settings:

| Tool                  | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `check_setup_status`  | Calls `getSetupStatus()`, returns completion map                  |
| `update_org_settings` | Saves org profile fields (address, timezone, etc.)                |
| `update_org_shipping` | Saves shipping config (ship-from, default method, free threshold) |
| `update_org_payments` | Saves payment config (accepted methods, default terms, deposit)   |
| `update_org_taxes`    | Saves tax config (enable/disable systems, rates)                  |
| `update_org_returns`  | Saves returns config (window, restocking, address)                |
| `skip_setup_section`  | Marks a section as skipped in `org_setup_status`                  |

Each tool validates input against the same Zod schemas used by the manual settings forms.

## Stitch Flow

### Approach: Scripted Priority, Dynamic Skip (Hybrid)

Stitch follows a hard-coded step sequence but checks completion status before each step. Already-complete sections are silently skipped. If the user leaves and comes back, "Help finish setup" re-checks status and picks up from whatever's still incomplete.

### Interaction Model

- **One question at a time.** Every Stitch message contains exactly one ask. User answers, Stitch saves, next question.
- **Selectable options where possible.** Payment methods, terms, shipping methods presented as clickable selections. Free text only for addresses or custom names.
- **Progress feel.** After each save, brief confirmation + immediate next question. Momentum, not ceremony.
- **~5 questions fast path.** If user confirms defaults and skips optionals, they're order-ready in 5 questions. Full flow with all optionals is ~11.

### Step Sequence

**Phase 1 — Required:**

1. "What's your business address?" → saves address fields
2. "Should we use this as your shipping address too?" → Yes: sets `shipping_use_business_address` / No: asks for separate ship-from
3. "Here are your shipping methods. Which should be the default?" → shows auto-seeded list as single select + option to add different one
4. "Which payment methods do you accept?" → multi-select from: Credit Card, ACH/Bank Transfer, Check, Wire, Other
5. "What are your default payment terms?" → single select from: Net 15, Net 30, Net 60, Net 90, COD, Prepaid, Other

**Phase 2 — Optional (gateway question → skip or configure):**

6. "Want to customize your order settings? (numbering, minimums, commission)" → Skip: move on / Yes: sub-questions one at a time
7. "Do you have any tax requirements?" → No: mark skipped / Yes: "Which? US sales tax, VAT, or GST?" then rates
8. "Do you want to set up a return policy?" → No: mark skipped / Yes: window → restocking fee → return address, one at a time

**Phase 3 — Seed Data:**

9. "Let's get some products in. Have a spreadsheet or lookbook to upload?" → Upload: bulk import / No: add one manually / Skip for later
10. "Do you have existing buyer accounts to bring in?" → Upload: bulk import / No: add one / Skip for later
11. "Want to invite any team members or sales partners?" → No: done / Yes: name + email per invite

### System Prompt Design

When "Help finish setup" fires, Stitch receives:

- A setup-specific system prompt with the scripted sequence, gateway questions, and per-section field requirements
- The current `SetupStatus` object so it knows what to skip
- Instructions to ask one question at a time, use selectable options, and confirm after each save

This is injected alongside the existing Stitch system prompt so Stitch retains all its normal capabilities but operates in "setup mode."

## Insight Page Checklist

The `/insight` page shows a setup card when `getSetupStatus()` indicates incomplete sections.

### Layout

From the wireframe:

- **Header:** "{Name}, let's finish setting you up." + subtitle
- **Finish Setup card:** Description + three action buttons: Use Stitch, Manual, Contact us
- **Settings column:** Orders, Shipping, Returns, Payments, Taxes (with completion circles) + "Setup" links to manual pages. Counter showing "X of 5"
- **System column:** Products, Accounts, Members (with completion circles) + "Setup" links. Counter showing "X of 3"
- **Profile:** Listed separately below Settings with its own completion circle

### Completion Indicators

- Empty circle = incomplete
- Filled circle = complete (fields populated or explicitly skipped)
- Counters update in real-time based on `getSetupStatus()`

### "Use Stitch" Button

Fires a pre-built prompt (e.g., "Help me finish setting up my organization") to the Stitch AI chat panel. This opens the chat interface and Stitch begins the scripted flow from the first incomplete step.

### "Manual" / "Setup" Links

Each section's "Setup" link navigates to the corresponding `/organization/*` settings page. The user can configure things manually and the completion engine picks up the changes.

## Out of Scope

- Order import from external systems (future phase — raises account/product matching questions)
- Post-setup insight page content (what shows after setup is complete)
- Rep org onboarding flow
- Visual design details (tuned during real-time testing)
