# Email Intake — Setup Runbook

## Overview

Email ordering lets reps email `stitch@threadline.systems` to create orders. Inbound emails are received via **Resend** and processed by the webhook handler.

## DNS Setup

### MX Record

Resend handles inbound email via their receiving domain. No MX record needed on `threadline.systems` — instead, configure a receiving domain in the Resend dashboard:

1. Go to [resend.com/emails](https://resend.com/emails) → **Receiving** tab
2. Add `threadline.systems` as a receiving domain (or use the subdomain `stitch.threadline.systems`)
3. Follow Resend's DNS verification steps (typically a TXT record)

### Webhook Configuration

1. Go to [resend.com/webhooks](https://resend.com/webhooks)
2. Click **Add Webhook**
3. Endpoint URL: `https://threadline.systems/api/webhooks/inbound-email`
4. Select event: `email.received`
5. Copy the webhook signing secret → set as `RESEND_WEBHOOK_SECRET` in Vercel env vars

## Environment Variables

| Variable                | Description                         | Where  |
| ----------------------- | ----------------------------------- | ------ |
| `RESEND_API_KEY`        | Resend API key (already configured) | Vercel |
| `RESEND_WEBHOOK_SECRET` | Webhook signing secret from Resend  | Vercel |

## How It Works

1. Email arrives at `stitch@threadline.systems`
2. Resend receives it and sends a webhook to `/api/webhooks/inbound-email`
3. Handler verifies the Svix signature, fetches the full email via Resend API
4. Sender is matched to a Threadline user with `email_intake_enabled = true`
5. Claude extracts the order (account, brand, products, sizes, ship window)
6. Entities are resolved against the database using trigram matching
7. If everything matches cleanly → order auto-submitted
8. If issues found → order saved as draft, flagged for review at `/orders/review`

## Enabling for a User

Users enable email ordering at `/settings/email-intake`. Only users with the `rep`, `admin`, or `owner` role can enable it.

## Retention

Raw email data is stored by Resend. The `email_intakes` table keeps audit records indefinitely. The `resend_email_id` can be used to retrieve the original email from Resend's API.

## Troubleshooting

- **Webhook not firing**: Check Resend dashboard → Webhooks → event log. Resend stores emails even if the webhook is down.
- **Signature verification failing**: Ensure `RESEND_WEBHOOK_SECRET` matches the signing secret from Resend.
- **Orders landing in review**: Check `/orders/review` for the specific issues. Common causes: product name typo, missing variant size, unknown account.
- **Rate limited**: Sender is limited to 60 emails/hour. Check `email_intakes` table for recent entries.
