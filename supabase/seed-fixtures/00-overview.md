# Threadline demo seed — overview

These fixture docs are the source of truth for the demo dataset used in
marketing screenshots and internal demos. Every list below is precise:
account names, product style numbers, order-line contents. If a row
changes, the screenshots change — treat this directory like code.

## When to use

- After `bunx supabase db reset` wipes the local dev DB.
- After you manually create the orgs / users / connections described in
  `01-prerequisites.md`.
- Whenever you want to restore a known-good demo state for screenshots.

## How it runs

Two ways to run the seed:

### One-command (the fast path)

```sh
bun run seed           # seed against current (presumably empty) local DB
bun run seed:reset     # reset the local DB + seed
bun run dev:fresh      # reset + seed + launch dev server
```

The executable is `scripts/seed-demo.ts`. It handles everything —
auth-user creation, orgs, memberships, show setup, connections, and
all the data below — in one shot, typically under a second.

Related scripts:

```sh
bun run reset          # bunx supabase db reset (no seeding)
bun run migrate        # bunx supabase migration up (apply pending migrations to local DB)
```

### Claude-guided (the fallback)

If you'd rather have Claude walk the seed step-by-step (e.g. to inspect
state between phases, or because the script broke after a schema
change), tell it "seed Threadline from `supabase/seed-fixtures/`" and
it will:

1. Verify the expected user / org / connection setup exists in the DB.
2. Insert accounts (`02-accounts.md`).
3. Insert products + variants (`03-products.md`).
4. Insert orders + lines (`04-orders.md`).

The prerequisites described in `01-prerequisites.md` are needed only
for this fallback path — the `bun run seed` script creates them
directly.

## Source of truth

`scripts/seed-demo.ts` is the **executable source of truth** — if the
script and the markdown diverge, the script is right. The markdown
files exist as human-readable reference docs so the team can see the
dataset shape without reading TypeScript. When you change the dataset,
update both (the script first, then the markdown to match).

Identifiers in the fixtures are human-readable lookup keys (org name,
user email, account business name, product style number) — UUIDs
differ per setup, resolved at seed time.

## Order of operations (important)

The order matters because of FK dependencies and existing triggers:

1. **Prerequisites** — auth users (with `phone`); orgs (with full
   identity, address, `time_zone`/`currency_code`, and
   `onboarding_completed_at` set); org memberships (owners + extras
   with `manager_id`); org commerce defaults
   (taxes/shipping/returns/payments columns);
   `organization_sales_tax_rates`; `organization_shipping_methods`
   (then patch `organizations.default_shipping_method_id`); shows +
   show_dates; `org_connections`; `connection_members`;
   `member_territories`; self-brand profile fields; `brand_terms`.
2. **Accounts** — `accounts` (overrides on a subset),
   `account_locations` (one Primary per account), `buyer_invitations`
   (one per account; 5 are accepted later in Phase 5).
3. **Products + variants** — Elise Varga catalog (40 products, 200
   variants with cycled colors and a sprinkle of `price_override`),
   then the rep-owned **manual brand** Lago Sun (3 products + 15
   variants) with its own `brand_sales_tax_rates` and
   `brand_shipping_methods` rows.
4. **Orders + lines** — depends on accounts, season, source_type or
   show_date, rep user. The existing `set_order_number`,
   `federate_new_order`, and `recalc_order_total` triggers run
   automatically. Each order also stamps `location_id`,
   `payment_terms`, `shipping_method`, `terms_id`/`terms_agreed_by`/
   `terms_agreed_at`, plus a deterministic subset with `notes` and
   `po_number`. One row is seeded as `cancelled` with `cancelled_at`
   and `cancelled_reason`.
5. **Buyers + cart** — accept 5 of the 50 invites: create buyer auth
   users, insert `account_users` (one as `buyer_admin`), stamp
   matching invites `accepted_at`. Seed a 4-item `cart_items` cart
   for the first accepted buyer.
6. **Status flips** — the 4 delivered orders are inserted directly in
   `delivered` status (they skip the trigger chain — stock isn't
   decremented because `trg_decrement_stock_on_ship` fires on UPDATE
   only, not INSERT).

## Gotchas

- `order_lines.line_total` is a generated column. Never supply it.
- `orders.total_amount` is auto-maintained by the `recalc_order_total`
  trigger after line inserts. Don't set it manually.
- `trg_decrement_stock_on_ship` fires on UPDATE OF status — safe to
  INSERT orders with status='shipped' or 'delivered' without stock
  impact.
- Timestamps in fixtures are relative (`now() - interval`) rather than
  absolute. This keeps demo data feeling "current" no matter when you
  reseed; dashboard date-range filters work as expected.
- Account pairings on orders are explicit (not random) so the
  screenshots reproduce exactly. If you want fresh randomness, edit
  `04-orders.md` and document the new pairings before reseeding.

## Updating these docs

- Change a fixture first, then reseed. Don't edit the DB directly and
  backfill the docs — the docs are the source of truth.
- If you add a new persona, product, or order, append to the relevant
  file and keep the tables consistent.
- If the schema changes (new required column, etc.), update the docs
  and the Claude seed logic in the same PR.
