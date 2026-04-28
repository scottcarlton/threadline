# Sentry Alert Rules

Recommended alert configuration for the `scott-carlton/threadline` Sentry project. The goal: get paged on real production problems, stay quiet on preview noise, ignore local development entirely.

## Prerequisites

The Sentry SDK is configured to tag events with `environment` from `VERCEL_ENV` (see `src/hooks.client.ts` and `src/hooks.server.ts`). Values:

- `production` — `threadline.systems` (when wired to Vercel)
- `preview` — `dev.threadline.systems` and feature-branch previews
- `development` — local

Old environment tags (`vercel-production`, `vercel-preview`, the previous hardcoded `production` mix) won't receive new events. They can be deleted once the new tags accumulate enough events to be useful.

## Recommended rules

Set up at https://scott-carlton.sentry.io/alerts/rules/threadline/

### 1. Production: new issue — **page**

The most important rule. Anything new on prod should reach you fast.

- **Type:** Issue Alert
- **Name:** `[prod] New issue`
- **When:** A new issue is created
- **Filters:**
  - `environment` equals `production`
  - `level` is greater than or equal to `error`
- **Actions:** Send notification to your email (and Slack/Discord/PagerDuty if wired up later)
- **Frequency:** Most frequent — 5 minutes between repeated notifications for the same issue

### 2. Production: issue regression — **page**

Fires when an issue you previously marked resolved comes back. These are usually the most expensive bugs to ignore.

- **Type:** Issue Alert
- **Name:** `[prod] Regression`
- **When:** A previously resolved issue is no longer resolved
- **Filters:**
  - `environment` equals `production`
- **Actions:** Email
- **Frequency:** 5 minutes

### 3. Production: error spike — **page**

Catches "small bug suddenly affecting everyone."

- **Type:** Issue Alert
- **Name:** `[prod] Error spike`
- **When:** The issue is seen more than `25 times` in `5 minutes`
- **Filters:**
  - `environment` equals `production`
- **Actions:** Email
- **Frequency:** 30 minutes (don't repeat-spam during a real incident)

### 4. Preview: weekly digest — **don't page**

Optional. Lets you skim what's broken on dev without being woken up.

- **Type:** Issue Alert
- **Name:** `[preview] Weekly digest`
- **When:** A new issue is created
- **Filters:**
  - `environment` equals `preview`
- **Actions:** Email — but use Sentry's "Workflow Notifications → Weekly Reports" instead of per-event, OR set frequency to once per week per issue
- **Frequency:** Once per 7 days

### 5. Default rule — **disable**

Sentry creates a default "Send a notification for new issues" rule on every project. It fires on **all environments**, which means dev errors during local development also email you. Disable it after the rules above are in place.

- Go to https://scott-carlton.sentry.io/alerts/rules/threadline/
- Find the auto-created "Send a notification for new issues" rule
- Disable (don't delete — Sentry recreates it sometimes; disabling sticks)

## Future: when you have a team

When more than one person is on call, swap email actions for:

- **Slack** — Sentry → Settings → Integrations → Slack, then add `#alerts` channel as the action target
- **PagerDuty** — for true on-call rotation; integrate via Sentry → Settings → Integrations → PagerDuty

## Verification

After setting up the rules, trigger a test event to confirm routing:

```bash
# from local with env=production manually set, throw an error in any +server.ts route
# OR use the Sentry test endpoint
curl -X POST 'https://o4505xxxxxxxx.ingest.us.sentry.io/api/4505xxxxxxxx/store/' \
  -H 'X-Sentry-Auth: Sentry sentry_key=YOUR_PUBLIC_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"environment":"production","level":"error","message":"alert-test (delete me)"}'
```

Within ~1 minute you should get an email titled `[prod] New issue`. Resolve the issue in Sentry once verified.

## Quotas

Sentry free / Developer tier caps on event ingestion. Spike alerts and chatty preview errors can blow through quota fast. Watch your usage at https://scott-carlton.sentry.io/settings/billing/usage/ and consider:

- Adjust `tracesSampleRate` in `hooks.client.ts` / `hooks.server.ts` (currently `0.1`) if performance events get expensive
- Use `beforeSend` hooks to drop noisy errors (already filters SvelteKit `error(404)` and `redirect(303)`)
- Add a sample rate per environment if preview is too chatty
