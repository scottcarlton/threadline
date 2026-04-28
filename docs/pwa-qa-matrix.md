# PWA QA matrix

Run before opening PR #1 and any time the SW or manifest changes.

## Devices

- iPad (portrait + landscape)
- iPad Pro 12.9" (portrait + landscape)
- Desktop Chrome
- Desktop Safari

## Flows

| #   | Flow                                                                                  | Expected                                                             | Status |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| 1   | Chrome desktop: visit `/`, wait for `beforeinstallprompt`, click "Install Threadline" | Native install prompt appears; on accept, app installs to OS         |        |
| 2   | iOS Safari: visit `/`, click "Install Threadline"                                     | Instructions modal opens (Share → Add to Home Screen)                |        |
| 3   | Authenticated user, first dashboard load on tablet+                                   | First-login InstallPrompt modal appears once                         |        |
| 4   | Dismiss the first-login modal, reload                                                 | Modal does NOT reappear                                              |        |
| 5   | Already-installed (standalone) launch from home screen                                | App opens at `/dashboard` (or `/login` if no session)                |        |
| 6   | Toggle DevTools Offline, reload `/dashboard`                                          | Page loads from cache                                                |        |
| 7   | Toggle DevTools Offline, navigate to a page never visited                             | `offline.html` shown                                                 |        |
| 8   | Toggle DevTools Online                                                                | OfflineBanner disappears                                             |        |
| 9   | Push a redeploy with a SW change                                                      | Soft toast appears with "Reload" action                              |        |
| 10  | Toggle Offline while authenticated; AI dock send + voice buttons                      | Both render disabled with "Offline — ..." aria-label                 |        |
| 11  | DevTools → Application → Cache Storage                                                | `precache-<v>`, `pages-<v>`, `static-<v>` populated; no `/api/` URLs |        |
| 12  | DevTools → Application → Service Workers                                              | Status: activated and is running                                     |        |

## Lighthouse PWA audit

Run Lighthouse → PWA category on a deployed preview URL. Expected: green checks for **Installable** and **PWA Optimized**. Performance score not chased here.

Capture findings in the Status column above. Anything red gets a follow-up Linear ticket; nothing red blocks merge unless it's a SW skip-list miss or install failure.

## Skip-list spot check

Critical SW correctness — verify these endpoints are NEVER cached:

- `/api/*` (any data fetch)
- `/auth/*` (Supabase auth callbacks)
- `*.supabase.co` (DB + storage)
- `*sentry.io` (telemetry)
- All non-GET requests (mutations)

A miss here would silently desync the UI from the database (cached `/api/` data) or break sign-in (cached auth callbacks).
