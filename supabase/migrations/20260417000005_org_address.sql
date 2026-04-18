-- Add address fields to organizations
ALTER TABLE organizations ADD COLUMN address_line1 TEXT;
ALTER TABLE organizations ADD COLUMN address_line2 TEXT;
ALTER TABLE organizations ADD COLUMN city TEXT;
ALTER TABLE organizations ADD COLUMN state TEXT;
ALTER TABLE organizations ADD COLUMN zip TEXT;
ALTER TABLE organizations ADD COLUMN country TEXT NOT NULL DEFAULT 'US';
