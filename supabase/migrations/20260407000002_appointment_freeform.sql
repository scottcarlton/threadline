-- Allow appointments without a linked account (freeform entry)
ALTER TABLE appointments ALTER COLUMN account_id DROP NOT NULL;

-- Freeform account/contact fields for walk-ins or unlinked appointments
ALTER TABLE appointments ADD COLUMN freeform_account_name TEXT;
ALTER TABLE appointments ADD COLUMN freeform_contact_name TEXT;
ALTER TABLE appointments ADD COLUMN freeform_contact_email TEXT;
ALTER TABLE appointments ADD COLUMN freeform_contact_phone TEXT;
