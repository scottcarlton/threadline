-- Every org should ship with a usable default payment method. The initial
-- payment-preferences migration left the column default unset, so any org
-- created after that migration started with NULL. Lock in 'credit_card' as
-- the platform-wide default for new orgs and backfill the stragglers.

ALTER TABLE organizations
  ALTER COLUMN default_payment_method SET DEFAULT 'credit_card';

UPDATE organizations
  SET default_payment_method = 'credit_card'
  WHERE default_payment_method IS NULL;
