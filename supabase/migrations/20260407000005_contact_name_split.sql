-- Split contact_name into contact_first_name + contact_last_name for brands
ALTER TABLE brands ADD COLUMN contact_first_name TEXT;
ALTER TABLE brands ADD COLUMN contact_last_name TEXT;
UPDATE brands SET
  contact_first_name = split_part(contact_name, ' ', 1),
  contact_last_name = CASE
    WHEN position(' ' in coalesce(contact_name, '')) > 0
    THEN substring(contact_name from position(' ' in contact_name) + 1)
    ELSE NULL
  END
WHERE contact_name IS NOT NULL;
ALTER TABLE brands DROP COLUMN contact_name;

-- Split contact_name into contact_first_name + contact_last_name for accounts
ALTER TABLE accounts ADD COLUMN contact_first_name TEXT;
ALTER TABLE accounts ADD COLUMN contact_last_name TEXT;
UPDATE accounts SET
  contact_first_name = split_part(contact_name, ' ', 1),
  contact_last_name = CASE
    WHEN position(' ' in coalesce(contact_name, '')) > 0
    THEN substring(contact_name from position(' ' in contact_name) + 1)
    ELSE NULL
  END
WHERE contact_name IS NOT NULL;
ALTER TABLE accounts DROP COLUMN contact_name;
