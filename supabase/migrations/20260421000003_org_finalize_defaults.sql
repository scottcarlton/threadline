-- Org-level defaults for the split Finalize fields, plus account-level
-- mirrors so the per-order fallback chain (order → account → org) has a
-- source at every link. Also cleans up legacy rows where a terms code
-- (net_30, cod, etc.) got stored in default_payment_method back when the
-- method/terms list was conflated.

-- 1. Org defaults
ALTER TABLE organizations
  ADD COLUMN default_payment_terms TEXT DEFAULT 'net_30',
  ADD COLUMN default_shipping_method TEXT DEFAULT 'ground';

UPDATE organizations
  SET default_payment_terms = 'net_30'
  WHERE default_payment_terms IS NULL;

UPDATE organizations
  SET default_shipping_method = 'ground'
  WHERE default_shipping_method IS NULL;

-- 2. Move legacy terms codes out of default_payment_method into
--    default_payment_terms; reset method to the canonical default.
UPDATE organizations
  SET default_payment_terms = default_payment_method,
      default_payment_method = 'credit_card'
  WHERE default_payment_method IN ('net_15', 'net_30', 'net_60', 'net_90', 'cod', 'prepaid');

-- 3. Account-level mirrors. Accounts already have payment_preference
--    (method); give them payment_terms + shipping_method too so the
--    order Finalize step can fall back through account → org cleanly.
ALTER TABLE accounts
  ADD COLUMN payment_terms TEXT,
  ADD COLUMN shipping_method TEXT;

-- 4. Move legacy terms codes out of accounts.payment_preference into
--    accounts.payment_terms.
UPDATE accounts
  SET payment_terms = payment_preference,
      payment_preference = NULL
  WHERE payment_preference IN ('net_15', 'net_30', 'net_60', 'net_90', 'cod', 'prepaid');

-- 5. Same cleanup on the new orders.payment_terms / .payment_preference
--    split, for orders that were created before the Finalize redesign.
UPDATE orders
  SET payment_terms = payment_preference,
      payment_preference = NULL
  WHERE payment_preference IN ('net_15', 'net_30', 'net_60', 'net_90', 'cod', 'prepaid');
