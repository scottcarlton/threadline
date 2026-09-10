import { expect, test } from '@playwright/test';
import { signIn } from './setup/auth.js';
import { PERSONA_DISPLAY_NAMES, PERSONA_EMAILS, PERSONA_ORG_NAMES } from './setup/fixture.js';
import { ConsoleWatch, Shots, questionText, roadmapTitles } from './setup/preflight.js';
import { BRAND_PHASES, QUESTIONS, REP_PHASES, REP_STEPS } from './setup/questions.js';
import { walkPreflight } from './setup/walk.js';

test('rep walks preflight from the first question to the app', async ({ page }) => {
	const watch = new ConsoleWatch(page);
	const shots = new Shots('rep');

	await signIn(page, PERSONA_EMAILS.rep);
	await shots.take(page, 'signed-in');

	// The roadmap is rendered before the org type is known, so a rep is shown
	// the brand's four phases up front and loses one the moment they answer.
	expect(await roadmapTitles(page)).toEqual(BRAND_PHASES);

	const observed = await walkPreflight(page, REP_STEPS, shots, {
		displayName: PERSONA_DISPLAY_NAMES.rep,
		orgName: PERSONA_ORG_NAMES.rep,
		orgType: 'rep'
	});

	expect(observed.map((o) => o.step)).toEqual(REP_STEPS);

	// Settings is gone entirely: its three questions all belong to the brand.
	expect(observed.map((o) => o.step)).not.toContain('address');
	expect(observed.map((o) => o.step)).not.toContain('payment-terms');
	expect(observed.map((o) => o.step)).not.toContain('payment-methods');
	// And the org-level tools step goes with it; the mailbox stays.
	expect(observed.map((o) => o.step)).not.toContain('connect');

	// The brands step is the one a rep gains, and it leads the Import phase.
	expect(observed.map((o) => o.step)).toContain('brands');
	expect(observed[3]).toMatchObject({ step: 'brands', stepCounter: 'Step 2 of 3' });

	expect(observed.map((o) => `${o.step}: ${o.stepCounter} / ${o.questionCounter}`)).toEqual([
		'name: Step 1 of 4 / Question 1 of 3',
		'orgType: Step 1 of 4 / Question 2 of 3',
		'orgName: Step 1 of 3 / Question 3 of 3',
		'brands: Step 2 of 3 / Question 1 of 5',
		'members: Step 2 of 3 / Question 2 of 5',
		'accounts: Step 2 of 3 / Question 3 of 5',
		'products: Step 2 of 3 / Question 4 of 5',
		'orders: Step 2 of 3 / Question 5 of 5',
		'inbox: Step 3 of 3 / Question 1 of 1'
	]);

	await expect(page.getByText(/^Wait while I verify your/)).toBeVisible();
	await shots.take(page, 'verification');
	// The rep-specific read-back line exists and reports the empty state.
	await expect(page.getByText('No brands added yet')).toBeVisible();

	await page.waitForURL('**/insight', { timeout: 60_000 });
	await shots.take(page, 'landed');

	watch.assertClean();
});

test('the rep roadmap drops the Settings phase once the org type is answered', async ({ page }) => {
	const watch = new ConsoleWatch(page);
	const shots = new Shots('rep-roadmap');

	await signIn(page, PERSONA_EMAILS.repRoadmap);

	await expect(questionText(page)).toHaveText(QUESTIONS.name);
	expect(await roadmapTitles(page)).toEqual(BRAND_PHASES);

	await page
		.locator('div:has(> div > button[aria-label="Attach file"]) > input')
		.fill('Roadmap Rep');
	await page.keyboard.press('Enter');

	await expect(questionText(page)).toHaveText(QUESTIONS.orgType);
	await page
		.getByRole('button')
		.filter({ has: page.getByText('Independent Sales Rep', { exact: true }) })
		.click();

	await expect(questionText(page)).toHaveText(QUESTIONS.orgName);
	expect(await roadmapTitles(page)).toEqual(REP_PHASES);
	await shots.take(page, 'rep-roadmap-after-org-type');

	watch.assertClean();
});
