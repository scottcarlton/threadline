-- Default commission rate per team member (sales rep)
ALTER TABLE organization_members ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 0;
