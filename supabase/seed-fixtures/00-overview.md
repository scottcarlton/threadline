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
