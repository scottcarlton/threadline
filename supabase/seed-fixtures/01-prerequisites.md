# Prerequisites — orgs, users, connections, commerce defaults

This document describes the dataset shape that `scripts/seed-demo.ts`
produces in Phase 1. Everything here is created by the seed script;
the doc exists so a human can read what's in the dataset without
opening TypeScript. Identifiers are **lookup keys** (email, org name);
UUIDs differ per setup.

## 1. Users

Five users sign up via the auth admin API. The first three are org
owners; the last two are second members on `SH Showroom` and
`Elise Varga` so we can exercise team / manager / connection-member
flows. Every user gets `profiles.phone` set.

| Display name    | Email                   | Phone          | Org membership                                 |
| --------------- | ----------------------- | -------------- | ---------------------------------------------- |
| Elise Varga     | hello@elisevarga.com    | (212) 555-0140 | admin of Elise Varga (manages_others)          |
| Sofia Hernandez | sofia@sofiahernandez.co | (917) 555-0117 | admin of SH Showroom (manages_others)          |
| Lauren Mackey   | lauren@laurenmackey.co  | (214) 555-0162 | admin of Lauren Mackey (manages_others)        |
| Maya Park       | maya@sofiahernandez.co  | (917) 555-0184 | sales of SH Showroom, manager_id → Sofia       |
| Noor Ramirez    | noor@elisevarga.com     | (212) 555-0173 | admin of Elise Varga (no manager — peer admin) |

All users share the dev password `threadline-demo-pw!`.

## 2. Organizations

Each org gets a complete identity profile (legal name, tagline, time
zone, currency, address) and is marked `onboarding_completed_at = now()`
so reseeding doesn't drop users into `/onboarding`.

| Org name      | Type  | Legal name              | Time zone        | Currency | Address                                |
| ------------- | ----- | ----------------------- | ---------------- | -------- | -------------------------------------- |
| Elise Varga   | brand | Elise Varga Studio LLC  | America/New_York | USD      | 247 W 38th St, Suite 410, New York, NY |
| SH Showroom   | rep   | SH Showroom Inc.        | America/New_York | USD      | 231 W 39th St, 8th Fl, New York, NY    |
| Lauren Mackey | rep   | Lauren Mackey Sales LLC | America/Chicago  | USD      | 1209 Slocum St, Dallas, TX             |

## 3. Brand records

Each org has one auto-created self-brand (via the brand-org migration
backfill). The seed updates Elise Varga's self-brand with website +
contact fields and inserts a current `brand_terms` row.

In addition, the seed inserts **one rep-owned manual brand** under
SH Showroom: **Lago Sun**. Manual brands carry their commerce
settings (taxes, shipping, returns, payments, order numbering) on the
`brands` row itself instead of inheriting from `organizations` — see
`20260426000001_brand_manual_commerce_settings`. Lago Sun has 3 styles
and 15 variants but no orders are placed against it in this pass.

| Brand name    | Owning org    | `is_self_brand` | Commerce settings location |
| ------------- | ------------- | --------------- | -------------------------- |
| Elise Varga   | Elise Varga   | true            | `organizations` row        |
| SH Showroom   | SH Showroom   | true            | `organizations` row        |
| Lauren Mackey | Lauren Mackey | true            | `organizations` row        |
| Lago Sun      | SH Showroom   | false (manual)  | `brands` row + brand\_\*   |

## 4. Org commerce defaults

Per-org defaults live on `organizations` (and on the manual brand row
for Lago Sun). The seed populates every column the `/organization/*`
pages bind to so each page renders with values, not defaults.

### 4a. Order numbering / minimums (`organizations`)

| Org           | Prefix | Pad | Next | Minimum   | Handling fee |
| ------------- | ------ | --- | ---- | --------- | ------------ |
| Elise Varga   | EV-    | 6   | 1024 | $750 (on) | $0           |
| SH Showroom   | SHS-   | 5   | 312  | (off)     | $0           |
| Lauren Mackey | LM-    | 5   | 188  | (off)     | $0           |

### 4b. Taxes

| Org           | Display   | US sales tax | EIN        | VAT | GST |
| ------------- | --------- | ------------ | ---------- | --- | --- |
| Elise Varga   | exclusive | enabled      | 47-1832094 | —   | —   |
| SH Showroom   | exclusive | —            | —          | —   | —   |
| Lauren Mackey | exclusive | —            | —          | —   | —   |

Per-state rates in `organization_sales_tax_rates` (Elise Varga only):

| State | Rate   | Type        |
| ----- | ------ | ----------- |
| NY    | 8.875% | destination |
| CA    | 9.50%  | destination |
| TX    | 8.25%  | destination |
| IL    | 10.25% | destination |
| MA    | 6.25%  | destination |
| CO    | 8.81%  | destination |

### 4c. Shipping

`organization_shipping_methods` rows per org; `organizations.default_shipping_method_id`
points at the **Ground** row for each.

| Org           | Methods                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| Elise Varga   | Ground ($18 / 5–7 d) — default · Express ($42 / 2 d) · Free over $2,500 |
| SH Showroom   | Ground ($15) — default · Express ($38)                                  |
| Lauren Mackey | Ground ($16) — default · Local pickup (free)                            |

Elise Varga also sets a separate ship-from address (Secaucus, NJ) and
`shipping_free_threshold_amount = 2500`.

### 4d. Returns

| Org           | Window  | Restocking fee | Buyer pays return shipping |
| ------------- | ------- | -------------- | -------------------------- |
| Elise Varga   | 14 days | 15% of line    | yes                        |
| SH Showroom   | 0 (off) | 0%             | no                         |
| Lauren Mackey | 0 (off) | 0%             | no                         |

Elise Varga's `returns_policy_text` is populated; the rep orgs leave
the policy blank.

### 4e. Payments

| Org           | Processor | Required deposit | Deposit account            | Pass surcharge |
| ------------- | --------- | ---------------- | -------------------------- | -------------- |
| Elise Varga   | manual    | 25%              | "...Operating" ending 4421 | no             |
| SH Showroom   | manual    | —                | —                          | no             |
| Lauren Mackey | manual    | —                | —                          | no             |

`accepted_payment_methods` is set on every org. `default_payment_terms`
defaults to `net_30`; `default_payment_method` to `credit_card`.

## 5. Manual brand commerce — Lago Sun

Lago Sun mirrors the org-level shape, but on the `brands` row and the
brand-scoped satellites.

| Concept    | Value                                                             |
| ---------- | ----------------------------------------------------------------- |
| Numbering  | LGS- · pad 5 · next 87                                            |
| Minimum    | $500 (on)                                                         |
| Commission | 12% default                                                       |
| Taxes      | US sales tax enabled, FL EIN 83-2741055, general 7%               |
| Tax rates  | FL 7%, GA 7.5%, TX 8.25% (`brand_sales_tax_rates`)                |
| Shipping   | Miami ship-from, free over $1,500                                 |
| Methods    | Ground ($14) — default · Express ($36) (`brand_shipping_methods`) |
| Returns    | 10-day window, 20% restocking, buyer pays return shipping         |
| Payments   | manual, 30% required deposit, account ending 7710                 |

## 6. Seasons + season deliveries

Both auto-created by triggers on org INSERT. Seasons: Spring, Summer,
Fall, Resort, Holiday. Season deliveries are pre-seeded via the
existing trigger and not modified by this script.

## 7. Source types (each rep org)

Auto-created on org INSERT (not by this seed). Rep orgs land with
`Road` and `JOOR`. Fixtures use `Road`; `JOOR` is left untouched.

## 8. Shows + show dates (each rep org)

| Org           | Show name      | Year | Month | City     | State | Venue             |
| ------------- | -------------- | ---- | ----- | -------- | ----- | ----------------- |
| SH Showroom   | Brand Assembly | 2026 | 1     | New York | NY    | Convention Center |
| SH Showroom   | FIG            | 2026 | 3     | Dallas   | TX    | (none)            |
| Lauren Mackey | CALA           | 2026 | 3     | Dallas   | TX    | (none)            |

## 9. Org connections + connection members

Both rep orgs connect to Elise Varga.

| Rep org       | Brand org   | Status | Commission |
| ------------- | ----------- | ------ | ---------- |
| SH Showroom   | Elise Varga | active | 12%        |
| Lauren Mackey | Elise Varga | active | 10%        |

`connection_members` rows attach the rep-side users to each connection:

| Connection                  | Member | manages_others |
| --------------------------- | ------ | -------------- |
| SH Showroom ↔ Elise Varga   | Sofia  | true           |
| SH Showroom ↔ Elise Varga   | Maya   | false          |
| Lauren Mackey ↔ Elise Varga | Lauren | true           |

## 10. Territories

Each org has 4 default territories auto-seeded by trigger: Northeast,
Southeast, Midwest, West Coast. `member_territories` assignments:

| Org           | Member | Territories                               |
| ------------- | ------ | ----------------------------------------- |
| Elise Varga   | Elise  | Northeast, Southeast, Midwest, West Coast |
| Elise Varga   | Noor   | Northeast, Southeast, Midwest, West Coast |
| SH Showroom   | Sofia  | Northeast, Southeast, Midwest, West Coast |
| SH Showroom   | Maya   | Northeast, Southeast (subset)             |
| Lauren Mackey | Lauren | Northeast, Southeast, Midwest, West Coast |

## 11. Brand terms

A single `brand_terms` row exists for the Elise Varga self-brand,
`is_current = true`. Submitted+ orders snapshot it as `terms_id`,
`terms_agreed_by`, `terms_agreed_at`.
