-- Rename email_intakes.resend_email_id to provider_email_id (provider-agnostic).
ALTER TABLE email_intakes RENAME COLUMN resend_email_id TO provider_email_id;

-- Store the raw email body at intake time. Brevo's inbound parse delivers
-- the full payload in the webhook (no later retrieval API), so we keep
-- a copy for the /orders/review/[intake_id] page.
ALTER TABLE email_intakes ADD COLUMN email_body text;
