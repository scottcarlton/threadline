# PWA + Tablet Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Threadline installable as a PWA with an offline app shell, and bring the authenticated app to a tablet-quality state on iPad and larger viewports — shipped as two stacked PRs from a single feature branch.

**Architecture:** Phase 1 adds PWA infrastructure (manifest, icons, SvelteKit-blessed service worker, install prompts, offline shell) entirely as new files plus minimal additions to `src/app.html` and the root layout. Phase 2 modifies the existing authenticated shell to behave correctly at iPad portrait (sidebar overlay, AI dock width recalc, touch targets) and adds two reusable UI primitives (`OverlayPanel`, `SectionSheet`) used by the primary sidebar and the organization sub-nav.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), TypeScript, Tailwind v4, Bits UI (modals), `@sveltejs/adapter-vercel`, Vitest, Sharp (icon generation, dev-only), `bun` package manager.

**Spec:** `docs/superpowers/specs/2026-04-27-pwa-and-tablet-shell-design.md`

---

## File structure

### Phase 1 — created

| Path                                          | Responsibility                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static/manifest.webmanifest`                 | Web App Manifest (name, icons, scope, display, theme/background colors). Static — no logic.                                                                               |
| `static/icons/icon-192.png`                   | 192×192 PNG icon.                                                                                                                                                         |
| `static/icons/icon-512.png`                   | 512×512 PNG icon.                                                                                                                                                         |
| `static/icons/icon-512-maskable.png`          | 512×512 PNG with 10% safe-zone padding (Android adaptive icons).                                                                                                          |
| `static/icons/apple-touch-icon.png`           | 180×180 PNG icon (iOS home screen).                                                                                                                                       |
| `static/offline.html`                         | Standalone offline fallback. No JS, no external assets. Inline CSS only.                                                                                                  |
| `scripts/generate-pwa-icons.ts`               | One-shot `bun` script. Reads `static/favicon.svg`, writes the 4 PNGs above using `sharp`. Idempotent.                                                                     |
| `src/service-worker.ts`                       | SvelteKit-blessed SW. Three-cache strategy (precache, pages, static). Skip-list for /api, /auth, Supabase, Sentry, non-GET. Posts `updateAvailable` message on `waiting`. |
| `src/lib/utils/viewport.ts`                   | Reactive viewport stores: `isLgUp`, `isTabletPortrait`. Backed by `matchMedia`.                                                                                           |
| `src/lib/utils/viewport.test.ts`              | Tests for `viewport.ts`.                                                                                                                                                  |
| `src/lib/stores/pwa.ts`                       | PWA state stores: `isOnline`, `installPromptEvent`, `swUpdateAvailable`, `isStandalone`. Plus `registerServiceWorker()` helper.                                           |
| `src/lib/stores/pwa.test.ts`                  | Tests for `pwa.ts`.                                                                                                                                                       |
| `src/lib/utils/install-eligibility.ts`        | Pure predicate: should the first-login modal show?                                                                                                                        |
| `src/lib/utils/install-eligibility.test.ts`   | Tests for the predicate.                                                                                                                                                  |
| `src/lib/components/pwa/OfflineBanner.svelte` | Top banner; shows when `isOnline === false`.                                                                                                                              |
| `src/lib/components/pwa/InstallCta.svelte`    | Public homepage button + iOS instructions modal.                                                                                                                          |
| `src/lib/components/pwa/InstallPrompt.svelte` | First-login modal. Driven by install-eligibility predicate.                                                                                                               |

### Phase 1 — modified

| Path                        | What changes                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app.html`              | Add manifest link, theme-color meta, apple-touch-icon, apple-mobile-web-app meta tags.                                                                                                |
| `src/routes/+layout.svelte` | Mount `OfflineBanner` (always when authed) + `InstallPrompt` (on first authed load). Register the service worker on mount. Subscribe to `swUpdateAvailable` and surface a soft toast. |
| `src/routes/+page.svelte`   | Add `<InstallCta />` to the homepage CTA/footer area.                                                                                                                                 |
| `package.json` / `bun.lock` | Add `sharp` as a dev dependency.                                                                                                                                                      |

### Phase 2 — created

| Path                                                       | Responsibility                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/lib/components/ui/overlay-panel/index.ts`             | Re-exports `OverlayPanel`.                                                                                         |
| `src/lib/components/ui/overlay-panel/overlay-panel.svelte` | Reusable slide-in panel: backdrop, body scroll lock, focus trap, escape-to-close. Slides from `'left' \| 'right'`. |
| `src/lib/components/ui/section-sheet/index.ts`             | Re-exports `SectionSheet`.                                                                                         |
| `src/lib/components/ui/section-sheet/section-sheet.svelte` | Grouped-nav slide-in sheet. Built on `OverlayPanel`.                                                               |
| `docs/tablet-audit.md`                                     | Stage 2 sweep checklist (committed audit doc).                                                                     |
| `docs/pwa-qa-matrix.md`                                    | QA matrix for PWA install + offline flows.                                                                         |

### Phase 2 — modified

| Path                                       | What changes                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/stores/preferences.ts`            | Add `sidebarOpen?: boolean` field + `setSidebarOpen()` action.                                                                                              |
| `src/lib/stores/preferences.test.ts`       | Add tests for the new field.                                                                                                                                |
| `src/lib/components/layout/sidebar.svelte` | Accept `mode: 'push' \| 'overlay'`. In overlay mode, render inside `OverlayPanel`.                                                                          |
| `src/lib/components/layout/navbar.svelte`  | Bump hamburger tap target to ≥44px on `< lg`.                                                                                                               |
| `src/routes/+layout.svelte`                | Default sidebar state by viewport, persist via preferences, switch sidebar mode by viewport, recalc AI dock left offset, bump dock touch targets on `< lg`. |
| `src/routes/organization/+layout.svelte`   | Hide sticky rail on `< lg`; add `Sections` trigger button + `SectionSheet`.                                                                                 |

---

## Phase 1 — PWA layer (PR #1)

### Task 1: Viewport util + tests

**Files:**

- Create: `src/lib/utils/viewport.ts`
- Create: `src/lib/utils/viewport.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/viewport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

describe('viewport utils', () => {
	let listeners: Map<string, Set<(e: MediaQueryListEvent) => void>>;

	beforeEach(() => {
		vi.resetModules();
		listeners = new Map();
		const matchMedia = (query: string) => {
			const matches =
				(query === '(min-width: 1024px)' && globalThis.__lgMatch === true) ||
				(query === '(min-width: 768px) and (max-width: 1023px)' && globalThis.__tpMatch === true);
			const set = listeners.get(query) ?? new Set();
			listeners.set(query, set);
			return {
				matches,
				media: query,
				onchange: null,
				addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => set.add(cb),
				removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => set.delete(cb),
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false
			} as MediaQueryList;
		};
		vi.stubGlobal('matchMedia', matchMedia);
		(globalThis as any).__lgMatch = false;
		(globalThis as any).__tpMatch = false;
	});

	it('isLgUp is false at iPad portrait widths', async () => {
		(globalThis as any).__lgMatch = false;
		const { isLgUp } = await import('./viewport.js');
		expect(get(isLgUp)).toBe(false);
	});

	it('isLgUp is true when min-width: 1024px matches', async () => {
		(globalThis as any).__lgMatch = true;
		const { isLgUp } = await import('./viewport.js');
		expect(get(isLgUp)).toBe(true);
	});

	it('isTabletPortrait is true at iPad portrait widths only', async () => {
		(globalThis as any).__tpMatch = true;
		const { isTabletPortrait } = await import('./viewport.js');
		expect(get(isTabletPortrait)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/utils/viewport.test.ts`
Expected: FAIL — module `./viewport.js` not found.

- [ ] **Step 3: Implement `viewport.ts`**

Create `src/lib/utils/viewport.ts`:

```ts
import { readable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

function fromMediaQuery(query: string): Readable<boolean> {
	return readable(false, (set) => {
		if (!browser || typeof matchMedia !== 'function') {
			return;
		}
		const mql = matchMedia(query);
		set(mql.matches);
		const handler = (e: MediaQueryListEvent) => set(e.matches);
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
	});
}

export const isLgUp = fromMediaQuery('(min-width: 1024px)');
export const isTabletPortrait = fromMediaQuery('(min-width: 768px) and (max-width: 1023px)');
```

The `browser` import keeps the SSR path safe — on the server, the stores stay at their initial `false` value.

For tests to read the initial value via `get()`, we additionally seed the store with `mql.matches` synchronously at subscribe time. That's already what the code does.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/utils/viewport.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/viewport.ts src/lib/utils/viewport.test.ts
git commit -m "feat(pwa): add reactive viewport stores (isLgUp, isTabletPortrait)"
```

---

### Task 2: PWA store + tests

**Files:**

- Create: `src/lib/stores/pwa.ts`
- Create: `src/lib/stores/pwa.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/stores/pwa.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

describe('pwa store', () => {
	beforeEach(() => {
		vi.resetModules();
		Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
		// matchMedia stub for isStandalone detection
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}));
	});

	it('isOnline reflects navigator.onLine on init', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		const { isOnline } = await import('./pwa.js');
		expect(get(isOnline)).toBe(false);
	});

	it('isOnline updates on online event', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		const { isOnline } = await import('./pwa.js');
		expect(get(isOnline)).toBe(false);
		Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
		window.dispatchEvent(new Event('online'));
		expect(get(isOnline)).toBe(true);
	});

	it('isOnline updates on offline event', async () => {
		const { isOnline } = await import('./pwa.js');
		expect(get(isOnline)).toBe(true);
		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		window.dispatchEvent(new Event('offline'));
		expect(get(isOnline)).toBe(false);
	});

	it('captures beforeinstallprompt event', async () => {
		const { installPromptEvent } = await import('./pwa.js');
		expect(get(installPromptEvent)).toBeNull();
		const fakeEvent = new Event('beforeinstallprompt');
		(fakeEvent as any).prompt = vi.fn();
		window.dispatchEvent(fakeEvent);
		expect(get(installPromptEvent)).toBe(fakeEvent);
	});

	it('isStandalone is false when not in standalone display mode', async () => {
		const { isStandalone } = await import('./pwa.js');
		expect(get(isStandalone)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/stores/pwa.test.ts`
Expected: FAIL — module `./pwa.js` not found.

- [ ] **Step 3: Implement `pwa.ts`**

Create `src/lib/stores/pwa.ts`:

```ts
import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectStandalone(): boolean {
	if (!browser) return false;
	if (typeof matchMedia !== 'function') return false;
	if (matchMedia('(display-mode: standalone)').matches) return true;
	// iOS Safari pre-PWA standalone flag
	if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
	return false;
}

function createOnlineStore(): Writable<boolean> {
	const store = writable<boolean>(browser ? navigator.onLine : true);
	if (browser) {
		const setOnline = () => store.set(true);
		const setOffline = () => store.set(false);
		window.addEventListener('online', setOnline);
		window.addEventListener('offline', setOffline);
	}
	return store;
}

function createInstallPromptStore(): Writable<BeforeInstallPromptEvent | null> {
	const store = writable<BeforeInstallPromptEvent | null>(null);
	if (browser) {
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			store.set(e as BeforeInstallPromptEvent);
		});
		window.addEventListener('appinstalled', () => {
			store.set(null);
		});
	}
	return store;
}

export const isOnline = createOnlineStore();
export const installPromptEvent = createInstallPromptStore();
export const swUpdateAvailable = writable<boolean>(false);
export const isStandalone = writable<boolean>(detectStandalone());

export async function registerServiceWorker(): Promise<void> {
	if (!browser) return;
	if (!('serviceWorker' in navigator)) return;
	try {
		const reg = await navigator.serviceWorker.register('/service-worker.js', {
			type: 'module'
		});
		// Listen for messages from the SW (update notification, etc.)
		navigator.serviceWorker.addEventListener('message', (event) => {
			if (event.data?.type === 'updateAvailable') {
				swUpdateAvailable.set(true);
			}
		});
		// Manual update check on focus — catches new builds without waiting for SW lifecycle.
		reg.addEventListener('updatefound', () => {
			const newWorker = reg.installing;
			if (!newWorker) return;
			newWorker.addEventListener('statechange', () => {
				if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
					swUpdateAvailable.set(true);
				}
			});
		});
	} catch (err) {
		console.error('Service worker registration failed:', err);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/stores/pwa.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/pwa.ts src/lib/stores/pwa.test.ts
git commit -m "feat(pwa): add pwa state stores and SW registration helper"
```

---

### Task 3: Install eligibility predicate + tests

**Files:**

- Create: `src/lib/utils/install-eligibility.ts`
- Create: `src/lib/utils/install-eligibility.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/install-eligibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowInstallPrompt } from './install-eligibility.js';

describe('shouldShowInstallPrompt', () => {
	const baseInputs = {
		userId: 'user-1',
		isStandalone: false,
		installAvailable: true,
		isLgUp: true,
		isTabletPortrait: false,
		isIosSafari: false,
		dismissedUserIds: new Set<string>()
	};

	it('returns true on lg+ when install is available and not dismissed', () => {
		expect(shouldShowInstallPrompt(baseInputs)).toBe(true);
	});

	it('returns true on iPad portrait when install is available', () => {
		expect(shouldShowInstallPrompt({ ...baseInputs, isLgUp: false, isTabletPortrait: true })).toBe(
			true
		);
	});

	it('returns false on phone widths', () => {
		expect(shouldShowInstallPrompt({ ...baseInputs, isLgUp: false, isTabletPortrait: false })).toBe(
			false
		);
	});

	it('returns false when already standalone', () => {
		expect(shouldShowInstallPrompt({ ...baseInputs, isStandalone: true })).toBe(false);
	});

	it('returns false when this user has dismissed', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				dismissedUserIds: new Set(['user-1'])
			})
		).toBe(false);
	});

	it('returns true on iOS Safari even without beforeinstallprompt', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				installAvailable: false,
				isIosSafari: true
			})
		).toBe(true);
	});

	it('returns false when neither install path is available', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				installAvailable: false,
				isIosSafari: false
			})
		).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/utils/install-eligibility.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the predicate**

Create `src/lib/utils/install-eligibility.ts`:

```ts
export interface InstallEligibilityInputs {
	userId: string;
	isStandalone: boolean;
	installAvailable: boolean;
	isLgUp: boolean;
	isTabletPortrait: boolean;
	isIosSafari: boolean;
	dismissedUserIds: Set<string>;
}

export function shouldShowInstallPrompt(inputs: InstallEligibilityInputs): boolean {
	if (inputs.isStandalone) return false;
	if (inputs.dismissedUserIds.has(inputs.userId)) return false;
	if (!inputs.isLgUp && !inputs.isTabletPortrait) return false; // phones excluded
	if (!inputs.installAvailable && !inputs.isIosSafari) return false;
	return true;
}

const STORAGE_KEY = 'threadline-install-dismissed-user-ids';

export function loadDismissedUserIds(): Set<string> {
	if (typeof localStorage === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const arr = JSON.parse(raw);
		return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : []);
	} catch {
		return new Set();
	}
}

export function persistDismissedUserId(userId: string): void {
	if (typeof localStorage === 'undefined') return;
	const set = loadDismissedUserIds();
	set.add(userId);
	localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function detectIosSafari(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
	const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
	return isIos && isSafari;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/utils/install-eligibility.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/install-eligibility.ts src/lib/utils/install-eligibility.test.ts
git commit -m "feat(pwa): add install-eligibility predicate and storage helpers"
```

---

### Task 4: Generate PWA icons

**Files:**

- Create: `scripts/generate-pwa-icons.ts`
- Modify: `package.json` (add `sharp` dev dep)
- Create (output): `static/icons/icon-192.png`, `static/icons/icon-512.png`, `static/icons/icon-512-maskable.png`, `static/icons/apple-touch-icon.png`

- [ ] **Step 1: Add `sharp` as a dev dependency**

Run: `bun add -d sharp`
Expected: `sharp` appears in `devDependencies` in `package.json`. `bun.lock` updated.

- [ ] **Step 2: Write the icon generator script**

Create `scripts/generate-pwa-icons.ts`:

```ts
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const SVG_PATH = resolve('static/favicon.svg');
const OUT_DIR = resolve('static/icons');
const BACKGROUND = '#fafafa';

const targets = [
	{ name: 'icon-192.png', size: 192, padding: 0 },
	{ name: 'icon-512.png', size: 512, padding: 0 },
	{ name: 'icon-512-maskable.png', size: 512, padding: 0.1 },
	{ name: 'apple-touch-icon.png', size: 180, padding: 0 }
];

async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	for (const { name, size, padding } of targets) {
		const innerSize = Math.round(size * (1 - padding * 2));
		const buffer = await sharp(SVG_PATH).resize(innerSize, innerSize).png().toBuffer();
		const offset = Math.round((size - innerSize) / 2);
		await sharp({
			create: {
				width: size,
				height: size,
				channels: 4,
				background: BACKGROUND
			}
		})
			.composite([{ input: buffer, top: offset, left: offset }])
			.png()
			.toFile(resolve(OUT_DIR, name));
		console.log(`wrote ${name}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

- [ ] **Step 3: Run the script**

Run: `bun run scripts/generate-pwa-icons.ts`
Expected: 4 PNG files written to `static/icons/`. Console output lists each.

- [ ] **Step 4: Verify the outputs visually**

Run: `ls -la static/icons/ && file static/icons/*.png`
Expected: 4 PNGs at sizes 192, 512, 512, 180. PNG image data confirmed.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-pwa-icons.ts static/icons/ package.json bun.lock
git commit -m "feat(pwa): add icon generator script and produce PNG icon set"
```

---

### Task 5: Web App Manifest

**Files:**

- Create: `static/manifest.webmanifest`

- [ ] **Step 1: Write the manifest**

Create `static/manifest.webmanifest`:

```json
{
	"name": "Threadline",
	"short_name": "Threadline",
	"description": "Wholesale platform for fashion brands, reps, and buyers",
	"start_url": "/dashboard",
	"scope": "/",
	"display": "standalone",
	"orientation": "any",
	"background_color": "#fafafa",
	"theme_color": "#fafafa",
	"icons": [
		{
			"src": "/icons/icon-192.png",
			"sizes": "192x192",
			"type": "image/png"
		},
		{
			"src": "/icons/icon-512.png",
			"sizes": "512x512",
			"type": "image/png"
		},
		{
			"src": "/icons/icon-512-maskable.png",
			"sizes": "512x512",
			"type": "image/png",
			"purpose": "maskable"
		}
	]
}
```

- [ ] **Step 2: Verify the JSON parses**

Run: `bun -e "console.log(JSON.parse(require('node:fs').readFileSync('static/manifest.webmanifest', 'utf8')).name)"`
Expected: `Threadline`

- [ ] **Step 3: Commit**

```bash
git add static/manifest.webmanifest
git commit -m "feat(pwa): add web app manifest"
```

---

### Task 6: Offline page

**Files:**

- Create: `static/offline.html`

- [ ] **Step 1: Write the offline page**

Create `static/offline.html`:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Offline · Threadline</title>
		<style>
			html,
			body {
				margin: 0;
				padding: 0;
				background: #fafafa;
				color: #2c2d30;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
			}
			.wrap {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				padding: 2rem;
				text-align: center;
			}
			.glyph {
				width: 56px;
				height: 56px;
				border-radius: 0;
				background: #2c2d30;
				color: #fafafa;
				display: flex;
				align-items: center;
				justify-content: center;
				font-style: italic;
				font-size: 1.5rem;
				margin-bottom: 1.5rem;
			}
			h1 {
				font-size: 1.5rem;
				font-weight: 600;
				margin: 0 0 0.5rem 0;
			}
			p {
				font-size: 0.875rem;
				color: #71717a;
				margin: 0 0 1.5rem 0;
				max-width: 32rem;
			}
			button {
				font: inherit;
				font-size: 0.875rem;
				font-weight: 500;
				padding: 0.625rem 1.25rem;
				border: 1px solid #2c2d30;
				background: #2c2d30;
				color: #fafafa;
				cursor: pointer;
			}
			button:hover {
				background: #1a1b1d;
			}
			@media (prefers-color-scheme: dark) {
				html,
				body {
					background: #09090b;
					color: #fafafa;
				}
				p {
					color: #a1a1aa;
				}
				.glyph {
					background: #fafafa;
					color: #09090b;
				}
				button {
					background: #fafafa;
					color: #09090b;
					border-color: #fafafa;
				}
				button:hover {
					background: #e4e4e7;
				}
			}
		</style>
	</head>
	<body>
		<main class="wrap">
			<div class="glyph">/</div>
			<h1>You're offline</h1>
			<p>Threadline can't reach the network right now. Check your connection and try again.</p>
			<button onclick="location.reload()">Try again</button>
		</main>
	</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add static/offline.html
git commit -m "feat(pwa): add offline fallback page"
```

---

### Task 7: app.html meta tags

**Files:**

- Modify: `src/app.html`

- [ ] **Step 1: Add the PWA meta tags**

Edit `src/app.html`. After the existing `<link rel="icon" ... />` line, add:

```html
<link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest" />
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
<link rel="apple-touch-icon" href="%sveltekit.assets%/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Threadline" />
```

The full updated `<head>`:

```html
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="text-scale" content="scale" />
	<link rel="icon" type="image/svg+xml" href="%sveltekit.assets%/favicon.svg" />
	<link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest" />
	<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
	<link rel="apple-touch-icon" href="%sveltekit.assets%/icons/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Threadline" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Instrument+Serif:ital@0;1&display=swap"
		rel="stylesheet"
	/>
	%sveltekit.head%
</head>
```

- [ ] **Step 2: Verify dev build still serves**

Run: `bun run dev` (in another shell), then `curl -sI http://localhost:5173/manifest.webmanifest | head -1`
Expected: `HTTP/1.1 200 OK`

Stop dev server (`q` or Ctrl+C in that shell).

- [ ] **Step 3: Commit**

```bash
git add src/app.html
git commit -m "feat(pwa): wire manifest, theme-color, apple meta in app.html"
```

---

### Task 8: Service worker — skeleton + register

**Files:**

- Create: `src/service-worker.ts`
- Modify: `src/routes/+layout.svelte` (call `registerServiceWorker()` on mount)

- [ ] **Step 1: Write the SW skeleton**

Create `src/service-worker.ts`:

```ts
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const PRECACHE = `precache-${version}`;
const PAGES = `pages-${version}`;
const STATIC = `static-${version}`;
const ALL_CACHES = [PRECACHE, PAGES, STATIC];

const PRECACHE_URLS = [
	...build, // SvelteKit-built JS/CSS chunks
	...files, // anything in /static
	'/offline.html'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PRECACHE);
			await cache.addAll(PRECACHE_URLS);
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)));
			await self.clients.claim();
			// Notify clients that an update is available (only if a previous SW was controlling).
			const clients = await self.clients.matchAll({ type: 'window' });
			for (const client of clients) {
				client.postMessage({ type: 'updateAvailable' });
			}
		})()
	);
});

self.addEventListener('fetch', (event) => {
	// Phase-1 skeleton: pass through to network, no caching yet.
	event.respondWith(fetch(event.request));
});
```

- [ ] **Step 2: Wire registration into the root layout**

Edit `src/routes/+layout.svelte`. In the `<script>` block, after the existing `import` statements, add:

```ts
import { registerServiceWorker } from '$lib/stores/pwa.js';
```

Inside the existing `onMount(() => { ... })` block, after the polling-start lines and before the cleanup `return`, add:

```ts
registerServiceWorker();
```

- [ ] **Step 3: Build to verify SW compiles**

Run: `bun run build`
Expected: build succeeds. `service-worker.js` appears in the build output (look in `.svelte-kit/output/client/`).

- [ ] **Step 4: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/service-worker.ts src/routes/+layout.svelte
git commit -m "feat(pwa): add service worker skeleton and registration"
```

---

### Task 9: Service worker — precache + activation cleanup verified

**Files:**

- Modify: `src/service-worker.ts` (no code change yet — verify behavior)

- [ ] **Step 1: Run a local prod build and serve it**

Run: `bun run build && bun run preview`

In a separate shell, navigate to `http://localhost:4173/dashboard` (log in if needed).

- [ ] **Step 2: In DevTools (Application → Service Workers)**

Verify a service worker is registered, status is `activated and is running`. Under Application → Cache storage, verify a `precache-<version>` cache exists containing the build chunks plus `/offline.html`.

- [ ] **Step 3: Stop preview server**

`q` or Ctrl+C in the preview shell.

- [ ] **Step 4: No commit (verification only)**

Move to the next task.

---

### Task 10: Service worker — runtime caching (pages + static) + skip-list

**Files:**

- Modify: `src/service-worker.ts`

- [ ] **Step 1: Replace the `fetch` handler**

In `src/service-worker.ts`, replace the entire `fetch` handler block with:

```ts
function shouldSkipCache(request: Request): boolean {
	const url = new URL(request.url);
	if (request.method !== 'GET') return true;
	if (url.pathname.startsWith('/api/')) return true;
	if (url.pathname.startsWith('/auth/')) return true;
	if (url.hostname.endsWith('.supabase.co')) return true;
	if (url.hostname === '127.0.0.1' && url.port === '54322') return true; // local Supabase
	if (url.hostname.includes('sentry.io') || url.hostname.includes('ingest.sentry')) return true;
	return false;
}

async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	if (keys.length <= maxEntries) return;
	const overflow = keys.length - maxEntries;
	for (let i = 0; i < overflow; i++) {
		await cache.delete(keys[i]);
	}
}

async function networkFirstPage(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const networkRes = await fetch(request);
		if (networkRes.ok) {
			cache.put(request, networkRes.clone());
			trimCache(PAGES, 30);
		}
		return networkRes;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		const offline = await caches.match('/offline.html');
		return offline ?? new Response('Offline', { status: 503 });
	}
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
	const cache = await caches.open(STATIC);
	const cached = await cache.match(request);
	const networkPromise = fetch(request)
		.then((res) => {
			if (res.ok) {
				cache.put(request, res.clone());
				trimCache(STATIC, 60);
			}
			return res;
		})
		.catch(() => cached);
	return cached ?? (await networkPromise) ?? new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (shouldSkipCache(request)) return; // pass through to network

	const url = new URL(request.url);
	const isNavigation = request.mode === 'navigate';
	const isSameOrigin = url.origin === self.location.origin;

	if (isNavigation) {
		event.respondWith(networkFirstPage(request));
		return;
	}

	if (isSameOrigin) {
		event.respondWith(staleWhileRevalidate(request));
		return;
	}
	// cross-origin GETs (fonts, etc.): pass through
});
```

- [ ] **Step 2: Build and verify in DevTools**

Run: `bun run build && bun run preview`

In a logged-in session, navigate to `/dashboard`, then `/orders`, then `/accounts`. Open DevTools → Application → Cache storage. Verify:

- `pages-<v>` contains entries for the visited pages
- `static-<v>` contains image / font requests
- No `/api/...` or Supabase URLs in any cache

Now toggle DevTools → Network → "Offline". Reload `/dashboard`. Expected: page loads from `pages-<v>`. Click a link to a page you haven't visited: expected fallback to `/offline.html`.

Stop preview.

- [ ] **Step 3: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/service-worker.ts
git commit -m "feat(pwa): SW runtime caching (network-first pages, SWR static), skip-list, offline fallback"
```

---

### Task 11: OfflineBanner component

**Files:**

- Create: `src/lib/components/pwa/OfflineBanner.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/components/pwa/OfflineBanner.svelte`:

```svelte
<script lang="ts">
	import { isOnline } from '$lib/stores/pwa.js';
</script>

{#if !$isOnline}
	<div
		role="status"
		aria-live="polite"
		class="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-sm text-muted-foreground"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<line x1="1" y1="1" x2="23" y2="23" />
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
			<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
			<path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
			<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<line x1="12" y1="20" x2="12.01" y2="20" />
		</svg>
		<span>You're offline. Showing the last loaded data.</span>
	</div>
{/if}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/pwa/OfflineBanner.svelte
git commit -m "feat(pwa): add OfflineBanner component"
```

---

### Task 12: InstallCta component (homepage)

**Files:**

- Create: `src/lib/components/pwa/InstallCta.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/components/pwa/InstallCta.svelte`:

```svelte
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { installPromptEvent, isStandalone } from '$lib/stores/pwa.js';
	import { detectIosSafari } from '$lib/utils/install-eligibility.js';
	import { browser } from '$app/environment';

	let iosInstructionsOpen = $state(false);
	const isIos = $derived(browser ? detectIosSafari() : false);
	const canShow = $derived(!$isStandalone && ($installPromptEvent !== null || isIos));

	async function handleClick() {
		if ($installPromptEvent) {
			await $installPromptEvent.prompt();
			installPromptEvent.set(null);
			return;
		}
		if (isIos) {
			iosInstructionsOpen = true;
		}
	}
</script>

{#if canShow}
	<Button onclick={handleClick} variant="default" size="default">Install Threadline</Button>

	<Dialog.Root bind:open={iosInstructionsOpen}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
			<Dialog.Content
				class="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl"
			>
				<Dialog.Title class="text-lg font-semibold">Install on iOS</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted-foreground">
					Add Threadline to your home screen in three steps.
				</Dialog.Description>
				<ol class="mt-4 space-y-3 text-sm">
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
							>1</span
						>
						<span>Tap the Share button at the bottom of Safari.</span>
					</li>
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
							>2</span
						>
						<span>Scroll and tap <strong>Add to Home Screen</strong>.</span>
					</li>
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
							>3</span
						>
						<span>Tap <strong>Add</strong> in the upper right.</span>
					</li>
				</ol>
				<div class="mt-6 flex justify-end">
					<Button variant="outline" onclick={() => (iosInstructionsOpen = false)}>Got it</Button>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/pwa/InstallCta.svelte
git commit -m "feat(pwa): add InstallCta with iOS instructions modal"
```

---

### Task 13: InstallPrompt (first-login modal)

**Files:**

- Create: `src/lib/components/pwa/InstallPrompt.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/components/pwa/InstallPrompt.svelte`:

```svelte
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { installPromptEvent, isStandalone } from '$lib/stores/pwa.js';
	import { isLgUp, isTabletPortrait } from '$lib/utils/viewport.js';
	import {
		shouldShowInstallPrompt,
		loadDismissedUserIds,
		persistDismissedUserId,
		detectIosSafari
	} from '$lib/utils/install-eligibility.js';
	import { browser } from '$app/environment';

	type Props = { userId: string };
	let { userId }: Props = $props();

	let open = $state(false);
	let dismissed = $state<Set<string>>(new Set());

	$effect(() => {
		if (!browser) return;
		dismissed = loadDismissedUserIds();
	});

	const isIos = $derived(browser ? detectIosSafari() : false);

	$effect(() => {
		if (!browser) return;
		const eligible = shouldShowInstallPrompt({
			userId,
			isStandalone: $isStandalone,
			installAvailable: $installPromptEvent !== null,
			isLgUp: $isLgUp,
			isTabletPortrait: $isTabletPortrait,
			isIosSafari: isIos,
			dismissedUserIds: dismissed
		});
		if (eligible && !open) {
			open = true;
		}
	});

	async function handleInstall() {
		if ($installPromptEvent) {
			await $installPromptEvent.prompt();
			installPromptEvent.set(null);
		}
		persistDismissedUserId(userId);
		dismissed = loadDismissedUserIds();
		open = false;
	}

	function handleDismiss() {
		persistDismissedUserId(userId);
		dismissed = loadDismissedUserIds();
		open = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => !v && handleDismiss()}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl"
		>
			<Dialog.Title class="text-lg font-semibold">Install Threadline</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Get Threadline on your home screen for the fastest experience and a dedicated app window.
			</Dialog.Description>
			{#if isIos}
				<ol class="mt-4 space-y-2 text-sm">
					<li>1. Tap the Share button in Safari.</li>
					<li>2. Tap <strong>Add to Home Screen</strong>.</li>
					<li>3. Tap <strong>Add</strong>.</li>
				</ol>
				<div class="mt-6 flex justify-end gap-2">
					<Button variant="outline" onclick={handleDismiss}>Don't show again</Button>
				</div>
			{:else}
				<div class="mt-6 flex justify-end gap-2">
					<Button variant="outline" onclick={handleDismiss}>Not now</Button>
					<Button onclick={handleInstall}>Install</Button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/pwa/InstallPrompt.svelte
git commit -m "feat(pwa): add first-login InstallPrompt modal"
```

---

### Task 14: Mount PWA components in root layout + SW update toast

**Files:**

- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Import the components and stores**

In `src/routes/+layout.svelte`, in the `<script>` block, after the existing imports add:

```ts
import { swUpdateAvailable } from '$lib/stores/pwa.js';
import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';
import InstallPrompt from '$lib/components/pwa/InstallPrompt.svelte';
import { toast } from 'svelte-sonner';
```

- [ ] **Step 2: Add the SW update toast effect**

In the `<script>` block, after the existing `$effect(() => { ... })` blocks, add:

```ts
$effect(() => {
	if ($swUpdateAvailable) {
		toast('A new version of Threadline is available.', {
			action: {
				label: 'Reload',
				onClick: () => location.reload()
			},
			duration: Infinity
		});
	}
});
```

- [ ] **Step 3: Render the components in the authenticated branch**

In the `{:else}` branch of `{#if isAuthRoute}`, immediately inside the outer `<div class="flex h-screen flex-col overflow-hidden">`, before `<Navbar ...>`, insert:

```svelte
<OfflineBanner />
```

After the closing `</div>` of the AI-dock fixed container (the `{#if !hideAiDock || dockPeeking}` block), but still inside the `{:else}` branch's outer div, add:

```svelte
{#if data.user?.id}
	<InstallPrompt userId={data.user.id} />
{/if}
```

- [ ] **Step 4: Guard AI dock send/voice when offline**

In the `<script>` block of `src/routes/+layout.svelte`, add to imports if not already present:

```ts
import { isOnline } from '$lib/stores/pwa.js';
```

In the AI dock template, find the **send button** (`<button onclick={() => sendAiMessage()}>` with `aria-label="Send message"`). Add `disabled={!$isOnline}` and a `title`/tooltip-equivalent. Replace its opening tag with:

```svelte
<button
	onclick={() => sendAiMessage()}
	disabled={!$isOnline}
	class="flex h-9 w-9 items-center justify-center rounded-none bg-white text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
	aria-label={$isOnline ? 'Send message' : 'Offline — cannot send'}
>
```

Find the **voice toggle button** (`<button onclick={toggleVoice}>` in the idle branch, with `aria-label="Voice input"`). Apply the same `disabled` + `aria-label` pattern:

```svelte
<button
	onclick={toggleVoice}
	disabled={!$isOnline}
	class="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
	aria-label={$isOnline ? 'Voice input' : 'Offline — voice unavailable'}
>
```

Do not modify the active-voice-mode button (the one shown when `voiceMode` is true) — that path needs to stay clickable to allow the user to stop voice mode mid-session.

- [ ] **Step 5: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 6: Manual verification**

Run: `bun run dev`. Log in. Verify the install modal appears once. Dismiss it. Reload — modal does not reappear.

In DevTools → Application → Local Storage, confirm `threadline-install-dismissed-user-ids` contains the user id.

Toggle DevTools → Network → "Offline". Verify the AI dock send button and voice button render disabled with the "Offline — ..." aria-label. Toggle back to "Online" — buttons re-enable.

Stop dev.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat(pwa): mount OfflineBanner, InstallPrompt, SW update toast, and offline-guard AI dock"
```

---

### Task 15: Mount InstallCta on the homepage

**Files:**

- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Import `InstallCta`**

In the `<script>` block of `src/routes/+page.svelte`, add:

```ts
import InstallCta from '$lib/components/pwa/InstallCta.svelte';
```

- [ ] **Step 2: Render `<InstallCta />` inside the CTA section**

The existing CTA section is at `src/routes/+page.svelte:363`:

```svelte
<section data-section="cta">
	<div class="grid justify-center space-y-6 px-12 py-24">
		<h2 class="text-4xl">Get early access to Threadline</h2>
		<form ...>...</form>
	</div>
</section>
```

Replace that block with:

```svelte
<section data-section="cta">
	<div class="grid justify-center space-y-6 px-12 py-24">
		<h2 class="text-4xl">Get early access to Threadline</h2>
		<form
			class="grid max-w-lg grid-cols-[1fr_auto] rounded-lg border border-neutral-300 p-1.5 focus-within:border-foreground"
		>
			<input
				class="border-0 px-4 py-2 text-base outline-none"
				type="email"
				placeholder="Enter your email"
			/>
			<button class="ml-2 rounded-md bg-accent px-5 py-3"> Request Access </button>
		</form>
		<div class="flex items-center gap-3 text-sm text-muted-foreground">
			<span>Already have an account?</span>
			<InstallCta />
		</div>
	</div>
</section>
```

The `InstallCta` button hides itself when not installable / already installed, so this row degrades cleanly to just the leading text — which we then also hide with a `$derived` if needed in a follow-up. For Phase 1, the trailing copy stays visible because every visitor gets the CTA on a supported browser; the cleanup is logged as a Stage 2 audit row.

- [ ] **Step 3: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Manual verification (Chrome desktop)**

Run: `bun run build && bun run preview`. Visit `http://localhost:4173/`. The "Install Threadline" button should appear after `beforeinstallprompt` fires (Chrome will fire it on the unauth homepage when the manifest, SW, and HTTPS conditions are met — locally, Lighthouse can also trigger it manually).

Stop preview.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(pwa): add InstallCta to public homepage"
```

---

### Task 16: Lighthouse PWA audit + manual QA

**Files:**

- Create: `docs/pwa-qa-matrix.md`

- [ ] **Step 1: Write the QA matrix doc**

Create `docs/pwa-qa-matrix.md`:

```markdown
# PWA QA matrix

Run before opening PR #1 and any time the SW or manifest changes.

## Devices

- iPad (portrait + landscape)
- iPad Pro 12.9" (portrait + landscape)
- Desktop Chrome
- Desktop Safari

## Flows

| #   | Flow                                                                                  | Expected                                                     | Status |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| 1   | Chrome desktop: visit `/`, wait for `beforeinstallprompt`, click "Install Threadline" | Native install prompt appears; on accept, app installs to OS |        |
| 2   | iOS Safari: visit `/`, click "Install Threadline"                                     | Instructions modal opens (Share → Add to Home Screen)        |        |
| 3   | Authenticated user, first dashboard load on tablet+                                   | First-login InstallPrompt modal appears once                 |        |
| 4   | Dismiss the first-login modal, reload                                                 | Modal does NOT reappear                                      |        |
| 5   | Already-installed (standalone) launch from home screen                                | App opens at `/dashboard` (or `/login` if no session)        |        |
| 6   | Toggle DevTools Offline, reload `/dashboard`                                          | Page loads from cache                                        |        |
| 7   | Toggle DevTools Offline, navigate to a page never visited                             | `offline.html` shown                                         |        |
| 8   | Toggle DevTools Online                                                                | OfflineBanner disappears                                     |        |
| 9   | Push a redeploy with a SW change                                                      | Soft toast appears with "Reload" action                      |        |

## Lighthouse PWA audit

Run Lighthouse → PWA category on a deployed preview URL. Expected: green checks for Installable, PWA Optimized. Performance score not chased here.
```

- [ ] **Step 2: Run Lighthouse against the deployed preview (after PR #1 is up)**

This step is run after the PR is opened and a Vercel preview is deployed. The preview URL goes through HTTPS and has the live SW + manifest.

Capture the Lighthouse PWA report (PWA-Optimized green, Installable green). Document any findings in the QA matrix's Status column.

- [ ] **Step 3: Manual matrix run**

Walk through every row of the matrix above on real devices where possible (iPad mandatory). Mark Status. Anything red gets a follow-up Linear ticket; nothing red blocks merge unless it's a SW skip-list miss or install failure.

- [ ] **Step 4: Commit the QA matrix**

```bash
git add docs/pwa-qa-matrix.md
git commit -m "docs: PWA QA matrix"
```

---

### Task 17: Open PR #1 (PWA layer)

**Files:** none

- [ ] **Step 1: Run hard gates**

Run all of:

```bash
bun run check
bun run test:run
bun run lint
```

Expected: all pass with 0 errors.

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/pwa-setup`

- [ ] **Step 3: Open PR #1 with `gh`**

Run:

```bash
gh pr create --base dev --title "feat(pwa): installable PWA + offline app shell (phase 1 of 2)" --body "$(cat <<'EOF'
## Summary

Phase 1 of the PWA + tablet shell branch (`feat/pwa-setup`). Phase 2 (tablet shell) ships as a follow-up PR off the same branch once this is merged.

This PR is greenfield/additive: it makes Threadline installable as a Progressive Web App with an offline-capable application shell. No business logic, RLS, route loaders, or existing layouts are modified beyond a small set of additions to `src/app.html`, the root layout, and the homepage.

### What's in scope

- Web App Manifest, icon set (192/512/512-maskable + 180 apple-touch), iOS meta tags
- SvelteKit-blessed service worker with three-cache strategy (precache build/static, network-first pages, stale-while-revalidate static GETs)
- Skip-list: \`/api\`, \`/auth\`, Supabase, Sentry, all non-GET requests
- Offline fallback page (\`static/offline.html\`)
- OfflineBanner mounted in the authenticated shell
- Public homepage Install CTA (with iOS Add-to-Home-Screen instructions modal)
- First-login Install modal on tablet+, suppressed once dismissed per-user
- SW update flow: soft toast with reload action, never silent skipWaiting

### What's NOT in scope (Phase 2)

- Tablet-friendly shell (sidebar overlay, AI dock recalc, touch targets)
- OverlayPanel + SectionSheet primitives
- Organization sub-nav at iPad portrait
- Per-surface tablet pass

### Spec

\`docs/superpowers/specs/2026-04-27-pwa-and-tablet-shell-design.md\`

## Test plan

- [ ] \`bun run check\` clean
- [ ] \`bun run test:run\` passes
- [ ] \`bun run lint\` passes
- [ ] Lighthouse PWA category: Installable + PWA Optimized green on the deployed preview
- [ ] Manual matrix walked per \`docs/pwa-qa-matrix.md\` (real iPad)
- [ ] Chrome desktop: \`beforeinstallprompt\` fires; install completes; standalone app launches at \`/dashboard\`
- [ ] iOS Safari: instructions modal renders; Add-to-Home-Screen produces a working standalone shortcut
- [ ] Offline test: cached pages load, uncached pages fall back to \`offline.html\`, OfflineBanner toggles correctly
- [ ] First-login modal appears exactly once per user; dismiss is sticky
- [ ] No \`/api/\` or Supabase responses in any cache (verify via DevTools)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for Vercel preview, run Lighthouse against it, fill in the QA matrix**

Capture results in `docs/pwa-qa-matrix.md` Status column.

- [ ] **Step 5: Commit QA matrix updates**

```bash
git add docs/pwa-qa-matrix.md
git commit -m "docs: PWA QA matrix results"
git push
```

- [ ] **Step 6: Hold for review and merge**

Phase 2 begins after PR #1 merges into `dev`. Sync the branch:

```bash
git checkout feat/pwa-setup
git fetch origin
git merge origin/dev
```

---

## Phase 2 — Tablet shell (PR #2)

### Task 18: Persist `sidebarOpen` in preferences

**Files:**

- Modify: `src/lib/stores/preferences.ts`
- Modify: `src/lib/stores/preferences.test.ts`

- [ ] **Step 1: Add the failing test**

Edit `src/lib/stores/preferences.test.ts`. Inside the existing `describe('preferences store', ...)` block, add a new test:

```ts
it('setSidebarOpen updates only sidebarOpen', () => {
	preferences.setSidebarOpen(true);
	const prefs = get(preferences);

	expect(prefs.sidebarOpen).toBe(true);
	expect(prefs.appearance).toBe('auto');
	expect(prefs.animations).toBe('auto');
});
```

Also extend the `beforeEach` reset to include `sidebarOpen: undefined`:

```ts
preferences.set({
	appearance: 'auto',
	animations: 'auto',
	chatFont: 'default',
	autoHideDock: false,
	voiceId: 'EXAVITQu4vr4xnSDxMaL',
	sidebarOpen: undefined
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/stores/preferences.test.ts`
Expected: FAIL — `setSidebarOpen` is not a function.

- [ ] **Step 3: Update the store**

Edit `src/lib/stores/preferences.ts`. Update the `Preferences` interface and the `defaults`:

```ts
export interface Preferences {
	appearance: Appearance;
	animations: Animations;
	chatFont: ChatFont;
	autoHideDock: boolean;
	voiceId: string;
	sidebarOpen?: boolean;
}

const defaults: Preferences = {
	appearance: 'auto',
	animations: 'auto',
	chatFont: 'default',
	autoHideDock: false,
	voiceId: 'EXAVITQu4vr4xnSDxMaL',
	sidebarOpen: undefined
};
```

In `createPreferences()`, add to the returned object:

```ts
setSidebarOpen(v: boolean) {
	store.update((p) => ({ ...p, sidebarOpen: v }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/stores/preferences.test.ts`
Expected: PASS — all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/preferences.ts src/lib/stores/preferences.test.ts
git commit -m "feat(tablet): persist sidebarOpen in preferences store"
```

---

### Task 19: OverlayPanel primitive

**Files:**

- Create: `src/lib/components/ui/overlay-panel/index.ts`
- Create: `src/lib/components/ui/overlay-panel/overlay-panel.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/components/ui/overlay-panel/overlay-panel.svelte`:

```svelte
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { fly, fade } from 'svelte/transition';

	type Props = {
		open: boolean;
		side?: 'left' | 'right';
		ariaLabel: string;
		onclose: () => void;
		width?: string;
		children: Snippet;
	};

	let { open, side = 'left', ariaLabel, onclose, width = '280px', children }: Props = $props();

	let panelEl = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	$effect(() => {
		if (!browser) return;
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement | null;
			document.body.style.overflow = 'hidden';
			// Focus the panel on open for screen readers / keyboard nav.
			queueMicrotask(() => panelEl?.focus());
			return () => {
				document.body.style.overflow = '';
				previouslyFocused?.focus();
			};
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key === 'Tab' && panelEl) {
			const focusables = panelEl.querySelectorAll<HTMLElement>(
				'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/40"
		onclick={onclose}
		transition:fade={{ duration: 150 }}
	></div>
	<div
		bind:this={panelEl}
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
		tabindex="-1"
		class="fixed top-0 z-50 h-full bg-background shadow-xl outline-none"
		class:left-0={side === 'left'}
		class:right-0={side === 'right'}
		style:width
		transition:fly={{ x: side === 'left' ? -300 : 300, duration: 200 }}
	>
		{@render children()}
	</div>
{/if}
```

Create `src/lib/components/ui/overlay-panel/index.ts`:

```ts
export { default as OverlayPanel } from './overlay-panel.svelte';
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/overlay-panel/
git commit -m "feat(tablet): add OverlayPanel primitive (focus trap, scroll lock, escape)"
```

---

### Task 20: Sidebar mode prop + overlay rendering

**Files:**

- Modify: `src/lib/components/layout/sidebar.svelte`

- [ ] **Step 1: Read the current sidebar**

Run: `head -40 src/lib/components/layout/sidebar.svelte`. Note the existing `Props` type and the outer wrapper.

- [ ] **Step 2: Update the Props and add the mode-aware wrapper**

In `src/lib/components/layout/sidebar.svelte`, update the `<script>` block to accept `mode` and `open`/`onclose`:

Add these to the `Props` type:

```ts
mode?: 'push' | 'overlay';
open?: boolean;
onclose?: () => void;
```

Add to the destructuring:

```ts
mode = 'push',
open = true,
onclose = () => {},
```

Add this import at the top:

```ts
import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
```

In the template, wrap the existing root sidebar markup:

```svelte
{#if mode === 'overlay'}
	<OverlayPanel {open} {onclose} ariaLabel="Main navigation" side="left" width="240px">
		<!-- existing sidebar content goes here, unchanged -->
	</OverlayPanel>
{:else}
	<!-- existing sidebar content goes here, unchanged -->
{/if}
```

The "existing sidebar content" is whatever the current root markup of `sidebar.svelte` was — keep it identical in both branches.

- [ ] **Step 3: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/layout/sidebar.svelte
git commit -m "feat(tablet): sidebar accepts overlay mode via OverlayPanel"
```

---

### Task 21: Root layout — viewport-aware sidebar + AI dock recalc

**Files:**

- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Import the viewport store and update sidebar state init**

In `src/routes/+layout.svelte`, add to imports:

```ts
import { isLgUp } from '$lib/utils/viewport.js';
```

Replace `let sidebarOpen = $state(true);` with:

```ts
let sidebarOpen = $state<boolean>(
	$preferences.sidebarOpen ?? (browser ? matchMedia('(min-width: 1024px)').matches : true)
);

$effect(() => {
	preferences.setSidebarOpen(sidebarOpen);
});
```

(`preferences` is already imported; if not, ensure `import { preferences } from '$lib/stores/preferences.js';` is present.)

- [ ] **Step 2: Switch sidebar render based on viewport**

In the template, find the existing `<div class="h-full shrink-0 overflow-hidden ...">` block that wraps `<Sidebar ... />`. Replace it with:

```svelte
{#if $isLgUp}
	<div
		class="h-full shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
		style="width: {sidebarOpen ? '240px' : '0px'}; opacity: {sidebarOpen ? '1' : '0'}"
	>
		<div class="h-full w-60">
			<Sidebar
				mode="push"
				role={data.membership?.role ?? 'guest'}
				orgType={data.orgType}
				currentOrg={data.organization}
				allMemberships={data.allMemberships}
				brandScope={data.brandScope}
				isBuyer={data.isBuyer}
				{isNxBlsr}
				bind:showHelp
			/>
		</div>
	</div>
{:else}
	<Sidebar
		mode="overlay"
		open={sidebarOpen}
		onclose={() => (sidebarOpen = false)}
		role={data.membership?.role ?? 'guest'}
		orgType={data.orgType}
		currentOrg={data.organization}
		allMemberships={data.allMemberships}
		brandScope={data.brandScope}
		isBuyer={data.isBuyer}
		{isNxBlsr}
		bind:showHelp
	/>
{/if}
```

- [ ] **Step 3: Recalculate AI dock left offset for overlay mode**

In the template, find the AI dock container with `style="left: {sidebarOpen ? '240px' : '0px'}"`. Replace the `style` attribute with:

```svelte
style="left: {$isLgUp && sidebarOpen ? '240px' : '0px'}"
```

- [ ] **Step 4: Close sidebar on route change in overlay mode**

In the `<script>` block, replace the placeholder `$effect(() => { if ($page.url.pathname) { /* Close sidebar on mobile nav */ } });` with:

```ts
$effect(() => {
	if ($page.url.pathname && !$isLgUp) {
		sidebarOpen = false;
	}
});
```

- [ ] **Step 5: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 6: Manual verification**

Run: `bun run dev`. Open in a browser at iPad portrait width (use DevTools device emulation set to iPad). Verify:

- Sidebar starts closed (overlay mode).
- Tap hamburger → sidebar slides in over content with backdrop.
- Tap backdrop / Escape / a nav link → sidebar closes.
- Resize to ≥1024px → sidebar persists/pushes content as before.

Stop dev.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat(tablet): viewport-aware sidebar overlay/push + AI dock recalc"
```

---

### Task 22: Touch target bumps (navbar hamburger + AI dock buttons)

**Files:**

- Modify: `src/lib/components/layout/navbar.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Bump the navbar hamburger**

In `src/lib/components/layout/navbar.svelte`, find the hamburger `<button>` (around line 64). Change its class from `class="cursor-pointer rounded-lg p-1.5 ..."` to:

```svelte
class="cursor-pointer rounded-lg p-2.5 lg:p-1.5 text-muted-foreground transition-all duration-200
hover:bg-ghost hover:text-foreground active:scale-95"
```

This gives ~44px tap target at iPad portrait (`p-2.5` = 10px padding × 2 + 20px icon = 40px ≈ 44px), restoring the compact density at `lg` and up.

- [ ] **Step 2: Bump AI dock voice/send/file buttons on `< lg`**

In `src/routes/+layout.svelte`, find the four small buttons in the AI dock (file attach, agent picker, send, voice). Change their `h-9 w-9` classes to `h-11 w-11 lg:h-9 lg:w-9`. There are typically 2–3 round buttons in that area.

For the file/agent toolbar buttons that use `p-1.5`, change to `p-2.5 lg:p-1.5`.

- [ ] **Step 3: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Manual verification**

Run: `bun run dev` at iPad portrait width. Verify hamburger and AI dock buttons are clearly tap-friendly (≥44px). Switch to `lg+` width — desktop density restored.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/layout/navbar.svelte src/routes/+layout.svelte
git commit -m "feat(tablet): bump touch targets to ≥44px below lg"
```

---

### Task 23: SectionSheet primitive

**Files:**

- Create: `src/lib/components/ui/section-sheet/index.ts`
- Create: `src/lib/components/ui/section-sheet/section-sheet.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/components/ui/section-sheet/section-sheet.svelte`:

```svelte
<script lang="ts">
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';

	type Item = {
		label: string;
		href: string;
		badge?: number;
	};

	type Group = {
		label: string;
		pill?: 'new';
		items: Item[];
	};

	type Props = {
		open: boolean;
		groups: Group[];
		activeHref: string;
		onclose: () => void;
		onnavigate: () => void;
	};

	let { open, groups, activeHref, onclose, onnavigate }: Props = $props();

	function isActive(href: string): boolean {
		if (href === '/organization') return activeHref === '/organization';
		return activeHref.startsWith(href);
	}
</script>

<OverlayPanel {open} {onclose} ariaLabel="Sections" side="left" width="280px">
	<div class="flex h-full flex-col overflow-y-auto p-4">
		<div class="mb-4 flex items-center justify-between">
			<span class="text-sm font-semibold">Sections</span>
			<button
				onclick={onclose}
				aria-label="Close sections"
				class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
		<nav class="space-y-5">
			{#each groups as group (group.label)}
				<div>
					<div class="mb-1.5 flex items-center gap-2 px-3">
						<span class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							{group.label}
						</span>
						{#if group.pill === 'new'}
							<span
								class="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background"
							>
								New
							</span>
						{/if}
					</div>
					<ul class="space-y-0.5">
						{#each group.items as item (item.href)}
							<li>
								<a
									href={resolve(item.href as never)}
									onclick={onnavigate}
									class={cn(
										'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
										isActive(item.href)
											? 'bg-muted text-foreground'
											: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
									)}
								>
									{item.label}
									{#if item.badge}
										<span
											class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-600"
											>{item.badge}</span
										>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>
	</div>
</OverlayPanel>
```

Create `src/lib/components/ui/section-sheet/index.ts`:

```ts
export { default as SectionSheet } from './section-sheet.svelte';
export type { Group as SectionSheetGroup } from './section-sheet.svelte';
```

Note: type re-exports from `.svelte` files in Svelte 5 require the explicit `type` keyword. If `bun run check` complains, move the type definitions into a sibling `types.ts` and re-export from both files.

- [ ] **Step 2: Run typecheck**

Run: `bun run check`
Expected: 0 errors. If it fails on the type re-export, create `src/lib/components/ui/section-sheet/types.ts` with the `Group`/`Item` types and import from there in both files.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/section-sheet/
git commit -m "feat(tablet): add SectionSheet primitive"
```

---

### Task 24: Organization layout — wire SectionSheet at `< lg`

**Files:**

- Modify: `src/routes/organization/+layout.svelte`

- [ ] **Step 1: Import the new pieces**

In the `<script>` block, add:

```ts
import { isLgUp } from '$lib/utils/viewport.js';
import { SectionSheet } from '$lib/components/ui/section-sheet/index.js';

let sheetOpen = $state(false);

const activeGroupItem = $derived.by(() => {
	for (const g of navGroups) {
		for (const item of g.items) {
			if (isActive(item.href)) return item;
		}
	}
	return null;
});
```

- [ ] **Step 2: Update the template**

In the `{:else}` branch of `{#if isDetailView}`, replace the `<div class="flex gap-8">` block with:

```svelte
{#if $isLgUp}
	<div class="flex gap-8">
		<nav class="sticky top-0 w-48 shrink-0 space-y-5 self-start">
			{#each navGroups as group (group.label)}
				<div>
					<div class="mb-1.5 flex items-center gap-2 px-3">
						<span class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							{group.label}
						</span>
						{#if group.pill === 'new'}
							<span
								class="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background"
							>
								New
							</span>
						{/if}
					</div>
					<ul class="space-y-0.5">
						{#each group.items as item (item.href)}
							<li>
								<a
									href={resolve(item.href)}
									class={cn(
										'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
										isActive(item.href)
											? 'bg-muted text-foreground'
											: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
									)}
								>
									{item.label}
									{#if item.badge}
										<span
											class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-600"
											>{item.badge}</span
										>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>

		<div class="min-w-0 flex-1">
			{@render children?.()}
		</div>
	</div>
{:else}
	<button
		onclick={() => (sheetOpen = true)}
		class="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-muted"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<line x1="3" y1="6" x2="21" y2="6" />
			<line x1="3" y1="12" x2="21" y2="12" />
			<line x1="3" y1="18" x2="21" y2="18" />
		</svg>
		<span>Sections{activeGroupItem ? ` · ${activeGroupItem.label}` : ''}</span>
	</button>

	<div class="mt-6">
		{@render children?.()}
	</div>

	<SectionSheet
		open={sheetOpen}
		groups={navGroups}
		activeHref={$page.url.pathname}
		onclose={() => (sheetOpen = false)}
		onnavigate={() => (sheetOpen = false)}
	/>
{/if}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Manual verification**

Run: `bun run dev` at iPad portrait width. Visit `/organization`. Verify:

- The vertical rail is hidden.
- A "Sections · Profile" button is visible.
- Tapping it opens the SectionSheet with the full grouped nav.
- Picking an item closes the sheet and navigates.
- Detail pages (`/organization/shows/[id]`) still bypass the sub-nav entirely.

Resize to `≥ lg` — original rail returns. Stop dev.

- [ ] **Step 5: Commit**

```bash
git add src/routes/organization/+layout.svelte
git commit -m "feat(tablet): organization sub-nav uses SectionSheet at < lg"
```

---

### Task 25: Stage 1 — verify high-traffic surfaces at iPad widths

**Files:**

- Create: `docs/tablet-audit.md`

- [ ] **Step 1: Set up the audit doc**

Create `docs/tablet-audit.md`:

```markdown
# Tablet audit

Walk every authenticated route at iPad portrait (768) and landscape (1024) widths. Mark each row green/yellow/red.

- 🟢 Green = renders correctly, no action.
- 🟡 Yellow = minor friction; trivial fix landed in this branch.
- 🔴 Red = needs a redesign; a follow-up Linear ticket is logged.

## Stage 1 — high-traffic surfaces (must verify)

| Route                               | iPad portrait | iPad landscape | Notes |
| ----------------------------------- | ------------- | -------------- | ----- |
| `/dashboard`                        |               |                |       |
| `/orders` (list)                    |               |                |       |
| `/orders/new`                       |               |                |       |
| `/accounts` (list)                  |               |                |       |
| `/accounts/[id]`                    |               |                |       |
| `/brands` (list)                    |               |                |       |
| `/organization`                     |               |                |       |
| `/organization/members`             |               |                |       |
| `/organization/shows/[id]` (detail) |               |                |       |
| `/inbox`                            |               |                |       |
| `/shop`                             |               |                |       |
| `/reports`                          |               |                |       |

## Stage 2 — sweep audit (everything else authenticated)

| Route                        | iPad portrait | Notes |
| ---------------------------- | ------------- | ----- |
| `/appointments`              |               |       |
| `/expenses`                  |               |       |
| `/products`                  |               |       |
| `/sheets`                    |               |       |
| `/shows`                     |               |       |
| `/seasons`                   |               |       |
| `/plan`                      |               |       |
| `/account`                   |               |       |
| `/insight`                   |               |       |
| `/intelligence`              |               |       |
| `/workspace`                 |               |       |
| `/settings`                  |               |       |
| `/settings/email-intake`     |               |       |
| `/organization/billing`      |               |       |
| `/organization/security`     |               |       |
| `/organization/contacts`     |               |       |
| `/organization/agents`       |               |       |
| `/organization/integrations` |               |       |
| `/organization/orders`       |               |       |
| `/organization/taxes`        |               |       |
| `/organization/shipping`     |               |       |
| `/organization/returns`      |               |       |
| `/organization/payments`     |               |       |
| `/organization/seasons`      |               |       |
| `/organization/shows`        |               |       |
| `/organization/territories`  |               |       |
| `/organization/partners`     |               |       |
```

- [ ] **Step 2: Walk Stage 1 surfaces**

Run: `bun run dev`. Open Chrome DevTools, set device emulation to iPad. For each Stage 1 row:

1. Visit the route at iPad portrait.
2. Check: layout fits without horizontal scroll, primary actions reachable, tap targets ≥44px, no clipped text, no hover-only controls hidden.
3. Mark 🟢 / 🟡 / 🔴 in the doc.
4. For 🟡: implement the trivial fix in the same step (e.g., bump a `<button>`'s padding, swap `flex` → `flex-wrap`, change `hidden md:block` to `hidden lg:block` if a column should hide on tablet).
5. For 🔴: file a Linear ticket and note the ticket ID.

Repeat at iPad landscape.

- [ ] **Step 3: Stop dev, commit fixes incrementally**

Each trivial fix gets its own commit with a `fix(tablet): <route> — <issue>` message. Don't bundle fixes across routes.

- [ ] **Step 4: Commit the audit doc once Stage 1 is complete**

```bash
git add docs/tablet-audit.md
git commit -m "docs(tablet): Stage 1 verification audit"
```

---

### Task 26: Stage 2 — sweep audit

**Files:**

- Modify: `docs/tablet-audit.md`

- [ ] **Step 1: Walk every Stage 2 row**

Run: `bun run dev` at iPad portrait. For each route in the Stage 2 table:

1. Visit briefly.
2. Mark 🟢 / 🟡 / 🔴.
3. 🟡 → trivial fix in the same loop. 🔴 → Linear ticket.

- [ ] **Step 2: Commit any Stage 2 trivial fixes**

Each route's fix gets its own commit. Don't sweep multiple routes' fixes into a single commit.

- [ ] **Step 3: Commit the completed audit**

```bash
git add docs/tablet-audit.md
git commit -m "docs(tablet): Stage 2 sweep audit complete"
```

---

### Task 27: Open PR #2 (tablet shell)

**Files:** none

- [ ] **Step 1: Run hard gates**

Run all of:

```bash
bun run check
bun run test:run
bun run lint
```

Expected: all pass with 0 errors.

- [ ] **Step 2: Push the branch**

Run: `git push`

- [ ] **Step 3: Open PR #2 with `gh`**

Run:

```bash
gh pr create --base dev --title "feat(tablet): tablet-quality authenticated shell (phase 2 of 2)" --body "$(cat <<'EOF'
## Summary

Phase 2 of the PWA + tablet shell branch (\`feat/pwa-setup\`). Builds on PR #1 (PWA layer).

This PR makes the authenticated app behave correctly on iPad and larger viewports, with iPad portrait as the design baseline (progressive enhancement to larger sizes).

### What's in scope

- \`OverlayPanel\` primitive: shared focus-trap + body-scroll-lock + escape-to-close + slide-in animation
- Sidebar accepts \`mode: 'push' | 'overlay'\` — \`< lg\` uses overlay, \`lg+\` keeps current push behavior
- Default sidebar state by viewport, persisted per-user via the \`preferences\` store
- AI dock width recalc and touch-target bumps on \`< lg\`
- Navbar hamburger touch target bumped to ≥44px on \`< lg\`
- \`SectionSheet\` primitive for grouped secondary navigation
- Organization sub-nav uses \`SectionSheet\` at \`< lg\`, keeps the sticky rail at \`lg+\`
- Stage 1 verification of high-traffic surfaces (dashboard, orders, accounts, brands, organization, inbox, shop, reports) at iPad portrait + landscape
- Stage 2 sweep audit of every other authenticated route, with trivial fixes landed in this PR and non-trivial work tracked in Linear

### Out of scope

- Mobile (phone) responsive
- Tablet polish on unauthenticated routes
- Replacing polling with Realtime
- Web Push
- IndexedDB offline reads, Background Sync writes
- Split-view layouts
- Gesture handling

### Spec

\`docs/superpowers/specs/2026-04-27-pwa-and-tablet-shell-design.md\`
\`docs/tablet-audit.md\` for the per-route verification record.

## Test plan

- [ ] \`bun run check\` clean
- [ ] \`bun run test:run\` passes
- [ ] \`bun run lint\` passes
- [ ] iPad portrait (real device): sidebar overlays correctly, backdrop tap closes, Escape closes, route change closes, body scroll locks while open, focus restored to hamburger on close
- [ ] iPad portrait (real device): organization \`Sections\` button opens SectionSheet, picking an item navigates and closes
- [ ] iPad landscape: sidebar pushes content as before; organization rail visible
- [ ] Desktop \`lg+\`: no behavior regression versus pre-PR
- [ ] Tap targets ≥44px in dock + navbar hamburger at \`< lg\`
- [ ] \`docs/tablet-audit.md\` is filled in for all listed routes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Walk the test plan on a real iPad after preview deploys**

Capture findings; if anything fails, push fixes to the same branch.

- [ ] **Step 5: Hold for review and merge**

After merge, the `feat/pwa-setup` branch is fully shipped. The worktree at `.worktrees/pwa-setup` can be torn down with `git worktree remove .worktrees/pwa-setup` once `feat/pwa-setup` is deleted from origin.
