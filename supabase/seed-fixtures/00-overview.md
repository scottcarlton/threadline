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

The workflow is: **you set up prerequisites manually, then tell Claude to
reseed from these fixtures.**

A Claude session would:

1. Read `01-prerequisites.md` — verify orgs, users, memberships, active
   connections, brand record, seasons, source types, and shows exist in
   the DB. Bail if anything is missing.
2. Read `02-accounts.md` — insert the 50 accounts under Elise Varga's
   org. Derived fields (email, phone, zip, website, created_at) follow
   the generation rules documented in that file.
3. Read `03-products.md` — insert the 40 products + 200 variants under
   Elise Varga brand. Variants follow the `XS/S/M/L/XL` rule with
   deterministic SKUs and stock.
4. Read `04-orders.md` — insert the 20 orders with their exact account
   pairings, sources, seasons, lines, and terminal statuses (including
   the 4 orders that start in `delivered`).

Every table is keyed by human-readable identifiers (org name, user
email, account business name, product style number). UUIDs differ per
setup, so Claude looks them up at seed-time.

## Order of operations (important)

The order matters because of FK dependencies and existing triggers:

1. Prerequisites — manually
2. Accounts — insert (depends on org)
3. Products + variants — insert (depends on org + brand + seasons)
4. Orders — insert (depends on accounts, season, source_type or
   show_date, rep user). The existing `set_order_number`,
   `federate_new_order`, and `recalc_order_total` triggers run
   automatically.
5. Status flips — the 4 delivered orders are inserted directly in
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
