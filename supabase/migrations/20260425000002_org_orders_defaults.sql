-- Phase 3 of organization redesign: Commerce > Orders defaults +
-- per-account overrides.
--
-- The org defaults below are applied to new orders. Each setting that
-- almost always varies per customer (commission rate, order minimum)
-- gets a nullable per-account override; NULL means "use the org default",
-- a non-null value wins.

ALTER TABLE organizations
  ADD COLUMN order_number_prefix TEXT NOT NULL DEFAULT '',
  ADD COLUMN next_order_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN order_minimum_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN order_minimum_amount NUMERIC(12,2),
  ADD COLUMN handling_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE accounts
  ADD COLUMN commission_rate_override NUMERIC(5,2),
  ADD COLUMN order_minimum_override NUMERIC(12,2);
