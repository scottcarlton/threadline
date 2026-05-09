# Email Intake — Setup Runbook

## Overview

Email ordering lets reps email `stitch@reply.threadline.systems` to create orders. Inbound emails are received via **Brevo Inbound Parse** and processed by the webhook handler.

## DNS Setup

### MX Record

Brevo requires two MX records on the inbound subdomain `reply.threadline.systems`:

1. In Squarespace DNS, add MX records on `reply`:
   - Priority 10 → `inbound1.sendinblue.com.`
   - Priority 20 → `inbound2.sendinblue.com.`
2. Wait for DNS propagation (typically 15 min – 24h)

### Inbound Parse Configuration

Create the inbound webhook via Brevo's API with bearer token auth:

1. Generate a random secret (e.g. `openssl rand -hex 32`)
2. Create the webhook via Brevo API with `auth: { type: "bearer", token: "<secret>" }`
3. Set `BREVO_WEBHOOK_SECRET` in Vercel env vars to that same secret
4. Brevo will send `Authorization: Bearer <secret>` on every webhook POST to `/api/webhooks/inbound-email`

### Sending Domain Authentication

Ensure `threadline.systems` is authenticated in Brevo (DKIM + SPF). See the migration plan for details.

## Environment Variables

| Variable               | Description                          | Where  |
| ---------------------- | ------------------------------------ | ------ |
| `BREVO_API_KEY`        | Brevo API key (full access)          | Vercel |
| `BREVO_WEBHOOK_SECRET` | Inbound parse webhook signing secret | Vercel |
| `BREVO_INBOUND_DOMAIN` | Inbound parse subdomain              | Vercel |
| `EMAIL_FROM`           | Sender address for outbound emails   | Vercel |

## How It Works

1. Email arrives at `stitch@reply.threadline.systems`
2. Brevo receives it and POSTs the parsed email directly to `/api/webhooks/inbound-email` (HMAC-SHA256 signed)
3. Handler verifies the signature — the full email body is included in the payload (no second API call needed)
4. Sender is matched to a Threadline user with `email_intake_enabled = true`
5. Claude extracts the order (account, brand, products, sizes, ship window)
6. Entities are resolved against the database using trigram matching
7. If everything matches cleanly → order auto-submitted
8. If issues found → order saved as draft, flagged for review at `/orders/review`

## Enabling for a User

Users enable email ordering at `/settings/email-intake`. Only users with the `rep`, `admin`, or `owner` role can enable it.

## Retention

The raw email body is stored in `email_intakes.email_body` at intake time. The `email_intakes` table keeps audit records indefinitely. The `provider_email_id` column stores the Brevo message UUID for cross-referencing with Brevo's transactional logs.

## Troubleshooting

- **Webhook not firing**: Check Brevo Dashboard → Transactional → Settings → Inbound parsing for the webhook status and logs.
- **Signature verification failing**: Ensure `BREVO_WEBHOOK_SECRET` matches the signing secret from Brevo's inbound parse configuration.
- **Orders landing in review**: Check `/orders/review` for the specific issues. Common causes: product name typo, missing variant size, unknown account.
- **Rate limited**: Sender is limited to 60 emails/hour. Check `email_intakes` table for recent entries.
