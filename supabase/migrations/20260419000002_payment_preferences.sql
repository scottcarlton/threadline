-- Payment preferences: org-level accepted methods + per-account/per-order selection.
-- The canonical list of method codes lives in src/lib/payment-methods.ts; the app
-- layer validates that any saved code is in PAYMENT_METHODS and in the org's
-- accepted_payment_methods. No DB-level CHECK/FK so canonical updates are code-only.

ALTER TABLE organizations
  ADD COLUMN accepted_payment_methods TEXT[] NOT NULL DEFAULT ARRAY[
    'credit_card','ach','check','wire',
    'net_15','net_30','net_60','net_90',
    'cod','prepaid','other'
  ],
  ADD COLUMN default_payment_method TEXT;

UPDATE organizations
  SET default_payment_method = 'net_30'
  WHERE default_payment_method IS NULL;

ALTER TABLE accounts
  ADD COLUMN payment_preference TEXT;

ALTER TABLE orders
  ADD COLUMN payment_preference TEXT;
