-- Phase 6 of organization redesign: Commerce > Returns.
-- All fields live on organizations (no new table). The return address
-- columns mirror the Phase-5 shipping_from_* naming.

ALTER TABLE organizations
  ADD COLUMN returns_window_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN returns_policy_text TEXT,
  ADD COLUMN returns_use_ship_from_address BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN returns_address_line1 TEXT,
  ADD COLUMN returns_address_line2 TEXT,
  ADD COLUMN returns_address_city TEXT,
  ADD COLUMN returns_address_state TEXT,
  ADD COLUMN returns_address_zip TEXT,
  ADD COLUMN returns_address_country TEXT,
  ADD COLUMN returns_restocking_fee_type TEXT NOT NULL DEFAULT 'percent'
    CHECK (returns_restocking_fee_type IN ('percent', 'flat')),
  ADD COLUMN returns_restocking_fee_value NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN returns_buyer_pays_shipping BOOLEAN NOT NULL DEFAULT FALSE;
