-- Phase 8a of organization redesign: Commerce > Payments (UI-only).
-- Adds the columns the new page binds to. Stripe Connect (8b) and Plaid
-- (8c) ship in separate PRs; payments_stripe_account_id and
-- payments_deposit_account_last4 stay null until then.
--
-- Reuses existing columns: accepted_payment_methods, default_payment_method,
-- default_payment_terms (added 20260421000003).

ALTER TABLE organizations
  ADD COLUMN payments_processor TEXT NOT NULL DEFAULT 'manual'
    CHECK (payments_processor IN ('stripe', 'manual')),
  ADD COLUMN payments_stripe_account_id TEXT,
  ADD COLUMN payments_stripe_link_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN payments_required_deposit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN payments_required_deposit_percent NUMERIC(5, 2),
  ADD COLUMN payments_deposit_account_name TEXT,
  ADD COLUMN payments_deposit_account_last4 TEXT,
  ADD COLUMN payments_surcharge_pass_to_buyer BOOLEAN NOT NULL DEFAULT FALSE;
