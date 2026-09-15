import { expect, test } from '@playwright/test';
import { signIn } from './setup/auth.js';
import { PERSONA_DISPLAY_NAMES, PERSONA_EMAILS, PERSONA_ORG_NAMES } from './setup/fixture.js';
import { ConsoleWatch, Shots, answerText, roadmapTitles } from './setup/preflight.js';
import { RETAILER_PHASES, RETAILER_REACHABLE_STEPS } from './setup/questions.js';
import { walkPreflight } from './setup/walk.js';

test('retailer answers General Information and is handed to the buyer portal', async ({ page }) => {
	const watch = new ConsoleWatch(page);
	const shots = new Shots('retailer');

	await signIn(page, PERSONA_EMAILS.retailer);
	await shots.take(page, 'signed-in');

	expect(await roadmapTitles(page)).toEqual(RETAILER_PHASES);

	const observed = await walkPreflight(page, RETAILER_REACHABLE_STEPS, shots, {
		displayName: PERSONA_DISPLAY_NAMES.retailer,
		orgName: PERSONA_ORG_NAMES.retailer,
		orgType: 'retailer',
		stopAfterQuestion: 'orgName'
	});

	expect(observed.map((o) => o.step)).toEqual(RETAILER_REACHABLE_STEPS);

	// Recorded, not endorsed: the roadmap still promises four phases at the
	// moment a retailer is one answer away from leaving the flow for good.
	// docs/preflight-ux-review.md calls this out as G2.
	expect(await roadmapTitles(page)).toEqual(RETAILER_PHASES);
	expect(observed.at(-1)?.stepCounter).toBe('Step 1 of 4');

	await answerText(page, PERSONA_ORG_NAMES.retailer);

	// create-retailer stamps onboarding_completed_at in the insert and the
	// client navigates straight to the portal. Phases 2 to 4 never render.
	await page.waitForURL('**/dashboard', { timeout: 60_000 });
	await shots.take(page, 'dashboard');

	watch.assertClean();
});

test('a completed retailer cannot re-enter preflight', async ({ page }) => {
	const watch = new ConsoleWatch(page);
	const shots = new Shots('retailer-resume');

	// Depends on the org created by the walk above. Playwright runs this file's
	// tests in order in a single worker; the two share state only via the
	// database, not via a browser context.
	await signIn(page, PERSONA_EMAILS.retailer, { expectUrl: '**/dashboard' });

	await page.goto('/onboarding');
	await page.waitForURL('**/dashboard', { timeout: 30_000 });
	await shots.take(page, 'bounced');

	watch.assertClean();
});
