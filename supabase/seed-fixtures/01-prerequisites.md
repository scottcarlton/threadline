# Prerequisites — manual setup before seeding

The demo dataset assumes these orgs, users, memberships, connections,
and org-scoped metadata already exist. Create them through the app's
normal onboarding flow (new user sign-up → new org → connect → accept)
or via direct SQL. Claude verifies everything below exists before
seeding and bails if anything is missing.

All identifiers below are **lookup keys**, not UUIDs. UUIDs differ per
setup; seed-time Claude resolves them from these natural keys.

## 1. Users

Three users sign up via the normal auth flow. Email is the canonical
lookup key for each.

| Display name    | Email                   | Role in their org |
| --------------- | ----------------------- | ----------------- |
| Elise Varga     | hello@elisevarga.com    | admin             |
| Sofia Hernandez | sofia@sofiahernandez.co | admin             |
| Lauren Mackey   | lauren@laurenmackey.co  | admin             |

## 2. Organizations

| Org name      | Type  | Owner / first admin | Notes                                   |
| ------------- | ----- | ------------------- | --------------------------------------- |
| Elise Varga   | brand | Elise Varga         | Brand org — owns the Elise Varga brand. |
| SH Showroom   | rep   | Sofia Hernandez     | MBISR rep org.                          |
| Lauren Mackey | rep   | Lauren Mackey       | MBISR rep org (single-person).          |

## 3. Brand record

Elise Varga's brand org contains one self-brand:

| Brand name  | Org         | `is_self_brand` |
| ----------- | ----------- | --------------- |
| Elise Varga | Elise Varga | true            |

This is created automatically when a brand-type org is set up via
onboarding. Claude verifies its presence.

## 4. Seasons (Elise Varga org)

Each Threadline org gets the same default season list on creation.
Verify these five exist under Elise Varga; if not, they were created by
the onboarding flow and need to be re-added by Claude.

| Season name |
| ----------- |
| Spring      |
| Summer      |
| Fall        |
| Holiday     |
| Resort      |

Seasons used in fixtures: **Spring**, **Summer**, **Fall** (all with
`product_year = 2026` via the products' `product_year` column, not via
season naming).

## 5. Season deliveries (Elise Varga org)

Default delivery windows per season, also created by onboarding.
Reference only — fixtures do not set `delivery_id` on orders; ship
windows are set via `start_ship_date` / `expected_ship_date` directly.

| Season  | Deliveries          |
| ------- | ------------------- |
| Spring  | 1/30, 2/28, 3/30    |
| Summer  | 4/30, 5/30, 6/30    |
| Fall    | 7/30, 8/30, 9/30    |
| Holiday | 10/30, 11/30, 12/30 |

## 6. Source types (each rep org)

Both MBISR rep orgs need the same two source types. These are created
manually by the org admin via Settings → Sources (or directly in SQL).

| Org           | Source name |
| ------------- | ----------- |
| SH Showroom   | Road        |
| SH Showroom   | JOOR        |
| Lauren Mackey | Road        |
| Lauren Mackey | JOOR        |

Note: JOOR exists but is not used by any fixture order (by design — the
demo avoids the JOOR source to highlight show-based sourcing).

## 7. Shows + show dates (each rep org)

Shows are created via Settings → Shows, with at least one show_date per
show. Fixtures reference these by `(org, show_name, year, month)`.

| Org           | Show name      | Year | Month | City     | State | Venue             |
| ------------- | -------------- | ---- | ----- | -------- | ----- | ----------------- |
| SH Showroom   | Brand Assembly | 2026 | 1     | New York | NY    | Convention Center |
| SH Showroom   | FIG            | 2026 | 3     | Dallas   | TX    | (none)            |
| Lauren Mackey | CALA           | 2026 | 3     | Dallas   | TX    | (none)            |

## 8. Org connections (both active)

Both rep orgs connect to Elise Varga as active brand partners. In
`org_connections`: `rep_org_id = rep org`, `brand_org_id = Elise
Varga org`, `status = 'active'`.

| Rep org       | Brand org   | Status |
| ------------- | ----------- | ------ |
| SH Showroom   | Elise Varga | active |
| Lauren Mackey | Elise Varga | active |

Connections are normally created via the /connect flow (brand generates
invite code → rep accepts). For seed-time verification, Claude checks
both rows exist with status='active'.

## 9. Verification checklist (Claude runs before seeding)

```sql
-- All three users exist
SELECT COUNT(*) = 3 FROM auth.users WHERE email IN (
  'hello@elisevarga.com','sofia@sofiahernandez.co','lauren@laurenmackey.co'
);

-- All three orgs exist
SELECT COUNT(*) = 3 FROM public.organizations WHERE name IN (
  'Elise Varga','SH Showroom','Lauren Mackey'
);

-- Brand record exists
SELECT COUNT(*) = 1 FROM public.brands b
JOIN public.organizations o ON o.id = b.organization_id
WHERE o.name = 'Elise Varga' AND b.name = 'Elise Varga' AND b.is_self_brand = true;

-- Seasons exist (at least Spring/Summer/Fall under Elise Varga)
SELECT COUNT(*) >= 3 FROM public.seasons s
JOIN public.organizations o ON o.id = s.organization_id
WHERE o.name = 'Elise Varga' AND s.name IN ('Spring','Summer','Fall');

-- Source types exist on each rep org
-- Shows + show_dates exist per section 7
-- Both connections exist with status='active'
```

If any check fails, stop and ask the user to create the missing
prerequisite before continuing.
