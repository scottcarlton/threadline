import { expect, test } from '@playwright/test';
import { signIn } from './setup/auth.js';
import { PERSONA_DISPLAY_NAMES, PERSONA_EMAILS, PERSONA_ORG_NAMES } from './setup/fixture.js';
import { ConsoleWatch, Shots, roadmapTitles } from './setup/preflight.js';
import { BRAND_PHASES, BRAND_STEPS } from './setup/questions.js';
import { walkPreflight } from './setup/walk.js';

test('brand walks preflight from the first question to the app', async ({ page }) => {
	const watch = new ConsoleWatch(page);
	const shots = new Shots('brand');

	await signIn(page, PERSONA_EMAILS.brand);
	await shots.take(page, 'signed-in');

	// Before the org type is answered the roadmap already promises four phases.
	expect(await roadmapTitles(page)).toEqual(BRAND_PHASES);

	const observed = await walkPreflight(page, BRAND_STEPS, shots, {
		displayName: PERSONA_DISPLAY_NAMES.brand,
		orgName: PERSONA_ORG_NAMES.brand,
		orgType: 'brand'
	});

	// The whole point of the harness: which questions, in which order.
	expect(observed.map((o) => o.step)).toEqual(BRAND_STEPS);

	// A brand is still asked the three questions a rep is not.
	expect(observed.map((o) => o.step)).toEqual(
		expect.arrayContaining(['address', 'payment-terms', 'payment-methods'])
	);

	// How the flow describes its own length, phase by phase.
	expect(observed.map((o) => `${o.step}: ${o.stepCounter} / ${o.questionCounter}`)).toEqual([
		'name: Step 1 of 4 / Question 1 of 3',
		'orgType: Step 1 of 4 / Question 2 of 3',
		'orgName: Step 1 of 4 / Question 3 of 3',
		'members: Step 2 of 4 / Question 1 of 4',
		'accounts: Step 2 of 4 / Question 2 of 4',
		'products: Step 2 of 4 / Question 3 of 4',
		'orders: Step 2 of 4 / Question 4 of 4',
		'address: Step 3 of 4 / Question 1 of 3',
		'payment-terms: Step 3 of 4 / Question 2 of 3',
		'payment-methods: Step 3 of 4 / Question 3 of 3',
		'inbox: Step 4 of 4 / Question 1 of 2',
		'connect: Step 4 of 4 / Question 2 of 2'
	]);

	// Closing beat, then the hand-off. Every step was skipped, so the read-back
	// should say so rather than claim work that did not happen.
	await expect(page.getByText(/^Wait while I verify your/)).toBeVisible();
	await shots.take(page, 'verification');
	await expect(page.getByText('No accounts imported — skipped for now')).toBeVisible();

	await page.waitForURL('**/insight', { timeout: 60_000 });
	await shots.take(page, 'landed');

	watch.assertClean();
});
