-- ============================================================
-- Fix expense number sequencing
-- ============================================================
--
-- Bug 1: generate_expense_number() derived the next sequence value from
-- COUNT(*) + 1 over brand_expenses for the org. brand_expenses has an
-- admin/owner DELETE policy, so deleting any expense that is not the
-- most recently created one causes the count to drop while the highest
-- expense_number already issued does not. The next insert then
-- recomputes a sequence value that is still in use and collides with a
-- live row on the unique constraint. This is reachable by ordinary use
-- (create three expenses, delete the middle one, create a fourth) and
-- also means expense_number is not a stable identifier: two expenses
-- can be assigned the same rendered number across their lifetime.
--
-- Fix: stop counting rows. Store a per-organization counter and
-- increment it with UPDATE ... RETURNING, the same pattern already used
-- by generate_order_number() (see 20260901000010_fix_order_number_padding.sql).
-- A stored counter only ever advances, so a delete elsewhere in the
-- table can never cause it to step backward.
--
-- The product is not live, so there is no production expense history to
-- preserve, and the counter's initial value does not need to be derived
-- from the numeric tail of existing expense_number strings the way a
-- production cutover would require. It does still need to be seeded
-- past whatever rows already exist, though: local and dev databases
-- carry seeded demo expenses, and if the counter started at 1 for an
-- org that already holds rows, the first post-migration insert would
-- collide immediately. See the backfill statement below.
--
-- Bug 2: the discriminator embedded in expense_number was
-- UPPER(LEFT(org_slug, 3)), but the uniqueness constraint on
-- expense_number was global (UNIQUE (expense_number), not scoped to
-- organization_id). Two organizations whose slugs share their first
-- three characters (e.g. "expseq-probe" and "expseq-other" both give
-- "EXP") produce identical expense_number values once their counters
-- reach the same sequence value, and the global constraint then rejects
-- the second insert.
--
-- Fix: scope the uniqueness constraint to (organization_id,
-- expense_number). Per-org uniqueness is strictly weaker than the old
-- global constraint, so every existing row already satisfies it -- no
-- data migration needed for this half. The slug discriminator itself is
-- left as-is: once uniqueness is enforced per-org it is purely
-- cosmetic, and widening it would change the format of numbers users
-- already recognise.
-- ============================================================

-- ------------------------------------------------------------
-- Counter column
-- ------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN next_expense_number INTEGER NOT NULL DEFAULT 1;

-- ------------------------------------------------------------
-- Backfill: the product is not live, so there is no production expense
-- history whose exact numbering must be preserved -- this is not the
-- careful "derive from the numeric tail of existing values" backfill
-- that a production cutover would need. Local and dev databases do
-- carry seeded demo expenses, though, and if the new counter started
-- at 1 for an org that already holds, say, EXP-XXX-00001 through
-- EXP-XXX-00005 from a demo seed, the very next insert would collide
-- with a live row and break local development immediately. A single
-- count-based initialisation is enough to avoid that: it does not need
-- to reconstruct the highest sequence ever issued, only to start past
-- however many rows currently exist. Organizations with zero expenses
-- are left at the column default of 1.
-- ------------------------------------------------------------

UPDATE organizations o
SET next_expense_number = sub.expense_count + 1
FROM (
  SELECT organization_id, COUNT(*) AS expense_count
  FROM brand_expenses
  GROUP BY organization_id
) sub
WHERE sub.organization_id = o.id;

-- ------------------------------------------------------------
-- Generator: increment the stored counter instead of counting rows.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TRIGGER AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  UPDATE organizations
    SET next_expense_number = COALESCE(next_expense_number, 1) + 1
    WHERE id = NEW.organization_id
    RETURNING slug, COALESCE(next_expense_number - 1, 1)
    INTO org_slug, seq_num;

  NEW.expense_number := 'EXP-' || UPPER(LEFT(org_slug, 3)) || '-' || LPAD(seq_num::TEXT, GREATEST(5, LENGTH(seq_num::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ------------------------------------------------------------
-- Scope uniqueness to the organization.
-- ------------------------------------------------------------

ALTER TABLE brand_expenses DROP CONSTRAINT brand_expenses_expense_number_key;
ALTER TABLE brand_expenses ADD CONSTRAINT brand_expenses_expense_number_key UNIQUE (organization_id, expense_number);
