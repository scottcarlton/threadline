-- Let brands bundle an agreed commission rate with each share of their
-- connect link. Rotate + stamp + single-use on every copy. Propagated
-- to org_connections (and rep's brands.commission_rate) on redemption.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00;

ALTER TABLE connection_invites
  ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0;
