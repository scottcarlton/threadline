# Preview Environment — `dev.threadline.systems`

A pre-production environment that mirrors the prod stack but is isolated from prod data. Used to test changes end-to-end on a live URL before they ship to `threadline.systems`.

## Architecture

```
                   ┌───────────────────────────────┐
                   │      dev.threadline.systems   │
                   │      (Vercel Preview / dev)   │
                   └──────────┬────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
   Supabase: sybouzmkxqlvydditjtk     Resend (sending domain:
   (project name "dev.threadline")     threadline.systems)
   Region: us-west-1
```

- **Production** (`threadline.systems`) is **not yet wired to Vercel** — currently still on Squarespace. When you launch, see "Promoting dev → prod" below.
- **Vercel project**: `threadline` (Hobby → Pro after upgrade)
- **Vercel environment**: Preview, branch alias `dev`
- **Supabase project**: `sybouzmkxqlvydditjtk` (dev.threadline) — separate from the production project (`rpvsobaslcpxfieceuln`, "Threadline")

## DNS

| Host                      | Type                  | Value                   | Provider    |
| ------------------------- | --------------------- | ----------------------- | ----------- |
| `dev.threadline.systems`  | CNAME                 | `cname.vercel-dns.com.` | Squarespace |
| `threadline.systems` apex | (Squarespace default) | n/a — not on Vercel     | Squarespace |

## Vercel project

- Production Branch: `main`
- Preview branch alias: `dev` → `dev.threadline.systems` (Settings → Domains, Git Branch = `dev`)
- Deployment Protection: Vercel Authentication on Preview only (free tier)

### Environment variables

The Supabase env vars use **dev-branch-scoped overrides** — the existing Production+Preview entries continue to point at prod values; dev-only overrides point at the dev Supabase. This means feature-branch previews fall back to prod Supabase (handy for some test scenarios) while `dev` branch alone uses dev Supabase.

Dev-branch-only overrides (`gitBranch: "dev"`, `target: ["preview"]`):

- `PUBLIC_SUPABASE_URL` → `https://sybouzmkxqlvydditjtk.supabase.co`
- `PUBLIC_SUPABASE_ANON_KEY` → dev anon key
- `SUPABASE_SERVICE_ROLE_KEY` → `sb_secret_*` (new format, equivalent to legacy service_role JWT)

All other env vars (Anthropic, Resend, Google, Slack, Discord, Notion, Microsoft, Shopify, Sentry) are scoped to Production+Preview and shared.

## Supabase (dev)

- Project ref: `sybouzmkxqlvydditjtk`
- Region: us-west-1
- Migrations: all 104 from `supabase/migrations/` applied
- Auth → URL Configuration:
  - Site URL: `https://dev.threadline.systems`
  - Redirect URLs allowlist: `https://dev.threadline.systems/**`
- Auth → Providers:
  - Email: enabled, Email OTP Length = **6**, Confirm email = **off**
  - Google: enabled with `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (same client as prod, with the dev callback added in Google Cloud Console)
- Auth → SMTP: custom SMTP via Resend
  - Sender: `Threadline Dev <noreply@threadline.systems>`
  - Host: `smtp.resend.com`, port 465, user `resend`, pass = dedicated Resend API key (`Threadline Dev SMTP (Supabase)`)
- Auth → Email Templates: **Magic Link** and **Reset Password** templates use `{{ .Token }}` only (no `{{ .ConfirmationURL }}` link — pre-fetch by email scanners would consume the OTP otherwise)

## OAuth provider redirects

For the Supabase Google login (the `GOOGLE_OAUTH_*` env vars, distinct from the Gmail integration `GOOGLE_*` env vars), Google Cloud Console authorized redirect URIs must include both prod and dev Supabase callbacks:

- `https://rpvsobaslcpxfieceuln.supabase.co/auth/v1/callback` (prod Supabase)
- `https://sybouzmkxqlvydditjtk.supabase.co/auth/v1/callback` (dev Supabase)

App-level integration callbacks (Gmail, Slack, etc.) still need their dev callbacks added — TODO until those flows are tested on dev.

## Email (Resend)

- Verified sending domain: `threadline.systems`
- Verified inbound domain: `inbound.threadline.systems`
- API keys: `threadline` (general), `Onboarding`, `Threadline Dev SMTP (Supabase)`
- Inbound webhook for dev: TODO (currently only prod webhook configured)

## Sentry environment tagging

`hooks.client.ts` and `hooks.server.ts` source `environment` from `import.meta.env.VERCEL_ENV`:

- `production` → real prod (when `threadline.systems` gets wired to Vercel)
- `preview` → `dev.threadline.systems` and any feature-branch preview
- `development` → local

Old auto-injected tags (`vercel-preview`, `vercel-production`) and the previous hardcoded `production` won't receive new events. They can be deleted from the Sentry env filter.

## Cron jobs

`vercel.json` has `*/5 * * * *` for `/api/cron/agent-triggers`. Vercel **only fires crons on Production deployments**, so this doesn't run on dev.threadline.systems unless the project is on a plan with preview crons.

## Known caveats

- **Federation invite tables use `USING (true)` SELECT policies.** `invitations`, `buyer_invitations`, `connection_invites`, `connection_member_invites` rely on the app filtering by random 256-bit token. Any anon-key holder can `select *` and dump every row. Defense-in-depth: convert to security-definer RPC functions (`get_invitation_by_token(p_token)`) — known issue, exists in prod too.
- **Storage**: `brand-assets` bucket created via migration. If image uploads 500, verify the bucket exists in dashboard.
- **Email confirmation off**: new email signups don't require verification. Re-enable for production.

## Promoting dev → prod (when ready to launch)

1. Add `threadline.systems` apex (and `www.threadline.systems` if desired) to the Vercel project's Domains, scoped to Production
2. At Squarespace DNS: replace the Squarespace site's A/CNAME records with Vercel's CNAME (`cname.vercel-dns.com.`)
3. Re-enable email confirmation in Supabase prod auth providers
4. Switch any Resend "From" addresses currently using `Threadline Dev` back to plain `Threadline`
5. Verify Sentry `production` env catches errors; review alerts
6. Verify all OAuth provider consoles list both `threadline.systems` and the prod Supabase callback URL

## Resetting dev data

To wipe the dev database to a clean baseline (keeps schema, deletes all rows + auth users):

```sql
-- via Supabase SQL Editor or MCP execute_sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
DELETE FROM auth.users;
```

## Spinning up a fresh dev project from scratch

If for any reason this project gets nuked, rebuild order:

1. Create new Supabase project, capture URL + DB password + anon key + service_role/secret key
2. Apply all migrations from `supabase/migrations/` (Supabase SQL Editor paste in two parts — split at `20260407000004_sales_role.sql` because that adds an enum value that must commit before later migrations reference it)
3. Configure auth (Site URL, redirect allowlist, providers, SMTP, email templates) per the Supabase section above
4. Add Vercel dev-branch-scoped env var overrides for the three Supabase keys
5. Add the new Supabase auth callback URL to Google Cloud Console for the Supabase OAuth client
6. Push to `dev` to trigger rebuild
