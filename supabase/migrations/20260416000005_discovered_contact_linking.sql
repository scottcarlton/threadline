-- Link a discovered contact to an existing account (SCO-36).
-- Adds the 'linked' status and a pointer to the target account. Once linked,
-- the contact drops out of the discovered list and its detail page pulls
-- the linked account's orders/appointments into the activity timeline.

ALTER TABLE discovered_contacts
  ADD COLUMN linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE discovered_contacts
  DROP CONSTRAINT discovered_contacts_status_check;

ALTER TABLE discovered_contacts
  ADD CONSTRAINT discovered_contacts_status_check
  CHECK (status IN ('new', 'saved', 'dismissed', 'linked'));

-- Only a linked contact may point at an account, and a linked contact must
-- have a target. Enforced as a CHECK so the status and pointer can't drift.
ALTER TABLE discovered_contacts
  ADD CONSTRAINT discovered_contacts_linked_account_consistency
  CHECK (
    (status = 'linked' AND linked_account_id IS NOT NULL)
    OR (status <> 'linked' AND linked_account_id IS NULL)
  );

CREATE INDEX idx_discovered_contacts_linked_account
  ON discovered_contacts (linked_account_id)
  WHERE linked_account_id IS NOT NULL;
