# PWA setup + tablet shell design

- **Date:** 2026-04-27
- **Branch:** `feat/pwa-setup`
- **Status:** Draft, pending user review
- **Author:** Scott Carlton (with Claude Code)

## Summary

Make Threadline installable as a Progressive Web App with an offline-capable application shell, and bring the authenticated app to a usable, design-considered state on iPad and larger viewports. Mobile (phone) support and unauthenticated-route responsiveness are deliberately out of scope and tracked for follow-up branches.

This branch ships two phased deliverables on a single feature branch (`feat/pwa-setup`), opened as two stacked PRs into `dev`:

1. **Phase 1 — PWA layer (PR #1, greenfield):** Web App Manifest, icon set, iOS meta, service worker, offline shell, install prompts.
2. **Phase 2 — Tablet shell (PR #2, after PR #1 merges):** Responsive sidebar/dock behavior at iPad portrait, an `OverlayPanel` primitive, a `SectionSheet` primitive for grouped secondary navigation (organization), and a staged tablet-quality pass over the authenticated routes.

Phasing rationale: the two layers share `src/routes/+layout.svelte` but have non-overlapping logical surface area. Splitting into two PRs keeps reviews focused (Phase 1 is greenfield / additive; Phase 2 modifies existing shell behavior) and matches the "one PR per deliverable" project rule.

## Goals

- A user with a supported browser can install Threadline to their home screen / desktop.
- The installed app launches in standalone mode, lands at `/dashboard`, and falls through to `/login` if unauthenticated (existing auth guard).
- The app shell loads when offline; navigations the SW can't satisfy fall back to a clean offline page.
- The authenticated app is designed iPad-portrait first, with progressive enhancement at larger breakpoints.
- The primary navigation shell (sidebar, AI dock, navbar) and the organization sub-nav both behave correctly on iPad portrait, landscape, and desktop.
- High-traffic authenticated surfaces are explicitly verified at iPad widths.

## Non-goals (this branch)

- Mobile (phone) viewport support. Phones are a future branch with a different design baseline.
- Tablet polish on unauthenticated routes other than the homepage Install CTA. Login/signup/marketing get their own future branch with mobile-first responsiveness.
- Replacing polling with Supabase Realtime. Tracked as a future branch.
- Web Push / OS notifications. Tracked as a future branch (depends on installed PWA being shipped first).
- Offline data caching (orders, accounts, etc.) via IndexedDB.
- Background Sync for queued offline writes.
- Split-view (list+detail) layouts on iPad.
- Gesture handling (swipe-to-open, pull-to-refresh).

## Scope decisions made during brainstorming

| Question                                       | Decision                                                                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which surfaces?                                | Authenticated routes only. Unauth routes get their own later branch (need mobile + above).                                                                                                           |
| PWA depth?                                     | Installable + offline app shell. No data-layer offline.                                                                                                                                              |
| Tablet UX depth?                               | Tablet-aware shell + selective list/detail surfaces, with iPad portrait as the design baseline (progressive enhancement to larger viewports).                                                        |
| Push notifications?                            | Out of scope this branch. Polling stays. Push and Realtime are independently shippable follow-ups.                                                                                                   |
| Sidebar behavior at iPad portrait?             | Overlay (slides in over content with backdrop) at `< lg`. Push (current behavior) at `lg+`. Default state: closed at `< lg`, open at `lg+`, persisted per-user via the existing `preferences` store. |
| Service worker strategy?                       | SvelteKit's built-in SW (`src/service-worker.ts`) using `$service-worker` virtual module. No `vite-plugin-pwa`.                                                                                      |
| Settings sub-nav (Claude-style tabs)?          | Skipped this branch — settings only has 2 real sub-pages today.                                                                                                                                      |
| Organization sub-nav at `< lg`?                | `SectionSheet` primitive: slide-in panel from the left preserving group labels and badges.                                                                                                           |
| In-app install fallback (after modal dismiss)? | Deferred to a follow-up branch. This branch ships only the homepage CTA + first-login modal.                                                                                                         |

## Architecture

### File map

**PWA layer (new):**

| Path                                          | Purpose                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `static/manifest.webmanifest`                 | Web App Manifest                                                                             |
| `static/icons/icon-192.png`                   | Standard icon                                                                                |
| `static/icons/icon-512.png`                   | Standard icon                                                                                |
| `static/icons/icon-512-maskable.png`          | Maskable icon for adaptive Android shapes                                                    |
| `static/icons/apple-touch-icon.png`           | 180px iOS home-screen icon                                                                   |
| `static/offline.html`                         | Self-contained offline fallback page (no JS, no external assets)                             |
| `scripts/generate-pwa-icons.ts`               | Idempotent `bun` script that generates all icon PNGs from `static/favicon.svg` using `sharp` |
| `src/service-worker.ts`                       | SvelteKit-blessed service worker                                                             |
| `src/lib/components/pwa/InstallPrompt.svelte` | First-login install modal (tablet+)                                                          |
| `src/lib/components/pwa/InstallCta.svelte`    | Public homepage CTA button + iOS instructions modal                                          |
| `src/lib/components/pwa/OfflineBanner.svelte` | Top banner driven by `navigator.onLine`                                                      |
| `src/lib/stores/pwa.ts`                       | Stores: `isOnline`, `installPromptEvent`, `swUpdateAvailable`, `isStandalone`                |
| `src/lib/utils/viewport.ts`                   | Reactive viewport derived stores: `isLgUp`, `isTabletPortrait`                               |
| `src/lib/components/ui/overlay-panel/`        | Shared focus-trap + body-scroll-lock helper                                                  |
| `src/lib/components/ui/section-sheet/`        | Grouped-nav slide-in sheet primitive                                                         |

**Tablet shell layer (modifications):**

| Path                                       | Change                                                                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.html`                             | Manifest link, theme-color meta, apple-touch-icon, apple-mobile-web-app meta tags                                                                                          |
| `src/routes/+layout.svelte`                | Sidebar default by viewport; overlay vs push behavior; AI dock width recalc on `< lg`; mount `OfflineBanner`; mount `InstallPrompt`; SW registration + update-toast wiring |
| `src/routes/+page.svelte`                  | Add `InstallCta` to the homepage CTA/footer area                                                                                                                           |
| `src/lib/components/layout/sidebar.svelte` | New `mode: 'push' \| 'overlay'` prop; render via `OverlayPanel` in overlay mode                                                                                            |
| `src/lib/components/layout/navbar.svelte`  | Bump hamburger tap target to ≥44px on `< lg`                                                                                                                               |
| `src/lib/stores/preferences.ts`            | Persist `sidebarOpen` per-user (currently in-memory only)                                                                                                                  |
| `src/routes/organization/+layout.svelte`   | Hide sticky rail on `< lg`; add `Sections` trigger button + `SectionSheet`                                                                                                 |

**Out of scope (no changes):** route data loaders, Supabase queries, RLS, auth flow, polling stores, marketing routes other than homepage CTA, unauth flows, business logic.

## Detailed design

### 1. PWA install layer

#### Web App Manifest

```json
{
	"name": "Threadline",
	"short_name": "Threadline",
	"description": "Wholesale platform for fashion brands, reps, and buyers",
	"start_url": "/dashboard",
	"scope": "/",
	"display": "standalone",
	"orientation": "any",
	"background_color": "<resolved from --background CSS token>",
	"theme_color": "<resolved from --background CSS token>",
	"icons": [
		{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
		{ "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
		{
			"src": "/icons/icon-512-maskable.png",
			"sizes": "512x512",
			"type": "image/png",
			"purpose": "maskable"
		}
	]
}
```

`start_url: "/dashboard"` makes installed launches go straight into the app. Unauthenticated launches fall through to `/login` via the existing SvelteKit auth guard. `scope: "/"` keeps the entire site (including `/shop` for buyers) in PWA context after install.

The `background_color` and `theme_color` are resolved at implementation time from `--background` in `src/app.css` — they are not invented. If the resolved value isn't suitable as a flat hex (e.g., it's a token that resolves to a CSS function), we hard-code an aligned hex with a comment naming the source token.

#### Icons

A single committed `bun` script (`scripts/generate-pwa-icons.ts`) reads `static/favicon.svg` and writes:

- `static/icons/icon-192.png` (192×192)
- `static/icons/icon-512.png` (512×512)
- `static/icons/icon-512-maskable.png` (512×512 with ~10% safe-zone padding for adaptive icon shapes)
- `static/icons/apple-touch-icon.png` (180×180)

Outputs are committed (not generated in CI). The script is re-run only when the source SVG or sizing changes. Uses `sharp` (added as a dev dependency).

#### iOS / Safari meta in `src/app.html`

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="<resolved>" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Threadline" />
```

#### Install entry points

Two surfaces:

**Public homepage CTA (`InstallCta.svelte`)** — placed in the homepage footer/CTA area in `src/routes/+page.svelte`. Behavior:

- On Chromium: button is enabled when `beforeinstallprompt` has fired. Clicking calls `prompt()` on the captured event and clears the store.
- On iOS Safari: button opens an instructions modal (Share button → "Add to Home Screen") with a small illustrated step-by-step.
- Hides entirely if `window.matchMedia('(display-mode: standalone)').matches` or `navigator.standalone === true`.

**First-login modal (`InstallPrompt.svelte`)** — mounted in the root authenticated layout. Triggers exactly once when:

- User is authenticated.
- Browser is on a tablet+ viewport (`isLgUp || isTabletPortrait`).
- Install is available (`installPromptEvent` present, or iOS Safari detected).
- App is not already installed (not standalone).
- Modal hasn't been dismissed before (tracked in `localStorage` keyed by user id).

Dismiss → permanent suppression for that user. Install → permanent suppression. The store key includes the user id so multiple accounts on a shared device each see the prompt once.

Brand-voice copy comes from `docs/brand/guidelines.md` §1.5 — written at implementation time, not invented.

### 2. Service worker + offline strategy

A single `src/service-worker.ts` using SvelteKit's `$service-worker` virtual module. No `vite-plugin-pwa`.

#### Three named caches, keyed by `version`

| Cache          | Contents                                                                     | Strategy                                        | Lifetime                                         |
| -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `precache-<v>` | `build` chunks + critical `files` (manifest, icons, favicon, `offline.html`) | Pre-populated at `install` event                | One per build; old versions purged on `activate` |
| `pages-<v>`    | HTML navigations                                                             | Network-first → cache fallback → `offline.html` | Trimmed to last 30 entries (LRU)                 |
| `static-<v>`   | Same-origin GETs for non-`/api/` assets (images, fonts)                      | Stale-while-revalidate                          | Trimmed to last 60 entries (LRU)                 |

#### Skip-list (never cached, passed straight through)

A `shouldCache(request)` guard at the top of the `fetch` handler returns false for:

- `/api/*` — data must be fresh; cached data would silently desync the UI from the database.
- `/auth/*` — auth callbacks and token refresh.
- Any `*.supabase.co` URL or local `127.0.0.1:54322` (dev DB).
- Sentry telemetry endpoints.
- Any non-GET request — mutations are never cached or queued.

This rule sidesteps the entire RLS-with-cached-responses problem: cached HTML is fine because RLS is enforced server-side at data load time, not at HTML render time.

#### SW update flow

1. New build → new `version` → new SW registers.
2. New SW installs and pre-populates `precache-<newv>` in the background.
3. New SW reaches `waiting`; the existing tab keeps running on the old SW.
4. SW posts `{ type: 'updateAvailable' }` to the existing client; the client sets `swUpdateAvailable = true`.
5. UI shows a soft `svelte-sonner` toast with action: "A new version of Threadline is available. Reload to update." Non-blocking, dismissible.
6. On user-confirmed reload, the new SW takes over; `activate` purges old caches.

We deliberately do **not** call `skipWaiting()` automatically — silently swapping a SW underneath an active session can corrupt in-flight forms.

#### Offline UX

- **Top banner (`OfflineBanner.svelte`)** — slim strip below the navbar, brand-token muted background. Auto-shows on `offline` event, auto-hides on `online`. Copy: "You're offline. Showing the last loaded data."
- **Offline navigation** — clicking a link to a page not in `pages-<v>` returns `offline.html` (static, self-contained: app glyph, "You're offline" headline, "Try again" button calling `location.reload()`).
- **Failed mutation** — `superForm`'s `onError` checks `!navigator.onLine` and swaps toast copy to: "You're offline — your changes weren't saved. Try again when you're back online." No queue, no retry.
- **AI dock + voice** — both already need network. We add an `if (!$isOnline)` guard that disables send/voice buttons with a tooltip "Offline" rather than letting clicks fail silently.

#### Auth interaction with offline

- Supabase session cookies are unaffected by the SW (cookies aren't intercepted).
- An existing session stays valid offline until token expiry.
- When token refresh requires network and the network is down, the next request 401s and the existing auth guard redirects to `/login`. Acceptable for MVP — we don't pretend to be authenticated when we're actually offline-and-expired.

### 3. Tablet shell

#### Breakpoint contract

A single source of truth in `src/lib/utils/viewport.ts`:

- `isLgUp` — derived from `matchMedia('(min-width: 1024px)')`. Updates reactively on viewport changes.
- `isTabletPortrait` — `(min-width: 768px) and (max-width: 1023px)`. Used only when iPad-portrait must be detected specifically (e.g., the first-login modal trigger). Most code only needs `isLgUp`.

Tailwind's `lg:` (≥1024px) is already aligned. We don't touch the Tailwind config.

#### Authenticated shell (`src/routes/+layout.svelte`)

| Concern                  | Current                                 | New                                                                                                                                              |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar default          | `let sidebarOpen = $state(true)` always | Defaults from `preferences.sidebarOpen ?? $isLgUp`, persisted per-user.                                                                          |
| Sidebar mode             | Always-push (content reflows)           | `lg+`: push (current). `< lg`: overlay — sidebar `position: fixed`, slides in over content with `bg-black/40` backdrop; content does not reflow. |
| Sidebar dismiss          | Toggle only                             | Overlay mode: toggle, backdrop tap, Escape, or route change all close it.                                                                        |
| Body scroll              | Always free                             | Locked while overlay is open (`document.body.style.overflow = 'hidden'`).                                                                        |
| Focus                    | None                                    | Focus trap inside overlay; restored to hamburger on close.                                                                                       |
| AI dock `left` offset    | `sidebarOpen ? '240px' : '0px'`         | `lg+`: same. `< lg`: always `0px`.                                                                                                               |
| AI dock max-width        | `754px`                                 | Keep — fits at iPad portrait (768px – padding).                                                                                                  |
| Touch targets in AI dock | `h-9 w-9` (36px)                        | Bump to `h-11 w-11` (44px) on `< lg` only — desktop hover stays compact.                                                                         |
| Navbar height            | `h-14` (56px)                           | Keep.                                                                                                                                            |
| Hamburger tap target     | `p-1.5` around `h-5 w-5` (~32px)        | `p-2` on `< lg` for ≥44px.                                                                                                                       |

The sidebar component (`src/lib/components/layout/sidebar.svelte`) gets a `mode: 'push' | 'overlay'` prop driven by `isLgUp`. Push mode renders as today. Overlay mode renders inside the new `OverlayPanel` primitive.

#### `OverlayPanel` primitive

A small shared primitive at `src/lib/components/ui/overlay-panel/`. Encapsulates:

- Backdrop element (`bg-black/40` with click-to-close).
- Body scroll lock on mount, restore on unmount.
- Focus trap with `inert` on the rest of the document while open.
- Escape-to-close.
- Restore focus to the previously focused element on close.
- Slide-from-left or slide-from-right via prop.

Used by both the primary sidebar (overlay mode) and `SectionSheet`. Centralizing this avoids duplicating accessibility plumbing.

#### `SectionSheet` primitive

A new `ui/` primitive at `src/lib/components/ui/section-sheet/`. Renders a grouped nav inside an `OverlayPanel`. Accepts a `groups` prop matching the existing organization layout's shape (`{ label, pill?, items: { label, href, badge? }[] }`). Used by the organization sub-nav at `< lg`. Available for any future page that has grouped secondary nav with too many items for horizontal scrollable tabs.

#### Organization sub-nav (`src/routes/organization/+layout.svelte`)

The existing 17-item / 5-group nav stays as-is on `lg+` (sticky `w-48 shrink-0` rail). On `< lg`:

- Hide the rail.
- Show a `Sections` button at the top of the page (next to the H1 "Organization"), styled as a secondary button with a list-icon glyph and the active section name (e.g., "Sections · Profile").
- Tapping opens a `SectionSheet` containing the full grouped nav (group labels, badges, "new" pills preserved). Picking an item closes the sheet and navigates.
- The existing `isDetailView` guard (`/organization/shows/[id]`, `/organization/contacts/[id]`, `/organization/territories/[id]`) is preserved — detail pages skip the sub-nav entirely.

### 4. Per-surface tablet pass — staged

Trying to redesign 30+ authenticated routes inside this branch would balloon scope. The plan is staged.

#### Stage 1 — explicitly verified at iPad portrait (768/834) and landscape (1024/1366)

- `/dashboard`
- `/orders` (list) and `/orders/new` (the wizard)
- `/accounts` (list) and `/accounts/[id]`
- `/brands` (list)
- `/organization` (with new SectionSheet) plus 2–3 sub-pages including one detail page
- `/inbox`
- `/shop` (buyer)
- `/reports`

For each: walk the page at the target widths. Capture issues. Fix what's actually broken — overflow, clipping, hover-only controls, sub-44px tap targets. Do not redesign.

#### Stage 2 — sweep audit (committed checklist)

Every other authenticated route gets a short visual pass at iPad portrait. Anything that overflows, clips, or has a tap target <44px gets logged in `docs/tablet-audit.md`. Trivial fixes land in this branch. Non-trivial fixes get a follow-up Linear ticket.

#### Stage 3 — future branches

Routes that need real tablet redesign (split-view list+detail, gesture support, etc.) are scoped per Linear ticket. Not this branch.

## Testing

### Unit (Vitest)

- `src/lib/utils/viewport.test.ts` — derive correct values from mocked `matchMedia`.
- `src/lib/stores/pwa.test.ts` — `isOnline` reflects `online`/`offline` events; `installPromptEvent` captures and clears.
- Install eligibility predicate — first-login modal trigger: `!standalone && !dismissed && (isLgUp || isTabletPortrait) && installAvailable`.
- Offline-aware form error messaging — toast copy switches based on `navigator.onLine`.
- SW update message handler — receives `{ type: 'updateAvailable' }`, sets store flag. (We test the message glue, not the SW itself; SWs aren't unit-testable in jsdom.)

### Manual QA matrix

Committed as `docs/pwa-qa-matrix.md`:

- **Devices:** iPad (portrait + landscape), iPad Pro 12.9" (portrait + landscape), desktop (Chrome + Safari).
- **States:** signed-out, signed-in, offline-after-load, fresh-install standalone mode.
- **Flows:**
  - Install on Chrome desktop (`beforeinstallprompt`).
  - Install on iOS Safari (Share → Add to Home Screen).
  - First-login modal trigger fires once, dismiss is sticky.
  - App launch from home screen icon → `/dashboard` if authenticated, `/login` if not.
  - Offline navigation falls back to `offline.html`.
  - SW update toast appears after a redeploy.
- **Lighthouse PWA audit:** Installable + PWA-optimized green. Not chasing 100s on Performance.

### Hard gates before claiming done

Per CLAUDE.md:

- `bun run check` — 0 errors.
- `bun run test:run` — pass.
- Manual exercise of the install + offline + first-login modal flows on a real iPad.

## Risks

- **iOS install is non-programmatic.** Safari does not fire `beforeinstallprompt`. The CTA on iOS opens an instructions modal — it cannot trigger the install dialog. This is a Safari constraint; we accept it and design for it.
- **SW + Sentry interaction.** The SW skip-list excludes Sentry endpoints, so error reporting is unaffected. The new Sentry env tagging from `VERCEL_ENV` (just merged from dev) is also unaffected — it sets a tag on init, not at request time.
- **SW caching of stale builds.** Mitigated by versioned cache names and the user-confirmed update toast. Worst case: a user keeps the tab open across multiple deploys and runs an old build until they reload. Acceptable.
- **First-login modal bothering users.** Single-shot per user, persisted in `localStorage`. Re-enable only if a user explicitly clears site data.
- **Touch-target bumps regressing desktop density.** Mitigated by scoping bumps to `< lg` only (`md:`/`lg:` Tailwind variants on the touch-target classes).

## Future work (explicit non-goals tracked here for visibility)

- Mobile (phone) responsive — separate branch with mobile-first approach.
- Tablet polish on unauth routes — separate branch alongside mobile.
- Polling → Supabase Realtime — separate branch; per-store refactor.
- Web Push — separate branch after installed PWA is in users' hands.
- IndexedDB offline reads + Background Sync writes — major future spec; will collide with RLS.
- Split-view (list+detail) layouts on iPad — per-entity Linear tickets.
- Gesture handling — swipe-to-open sidebar, pull-to-refresh.
- App Store / TWA wrappers.

## Open questions

None at time of writing. Any unanswered questions surfaced during planning have been folded into Future work or resolved as scope decisions.
