import { expect, test } from '@playwright/test';
import { signIn } from './setup/auth.js';
import { PERSONA_DISPLAY_NAMES, PERSONA_EMAILS, PERSONA_ORG_NAMES } from './setup/fixture.js';
import {
	ConsoleWatch,
	Shots,
	errorLine,
	expectQuestion,
	fileInput,
	skipButton
} from './setup/preflight.js';
import { QUESTIONS, REP_STEPS } from './setup/questions.js';
import { walkPreflight } from './setup/walk.js';

/**
 * Known defects, recorded rather than worked around.
 *
 * A rep org never has a self-brand: the auto_create_self_brand trigger only
 * fires for org_type = 'brand'. The catalog and orders steps are still in the
 * rep's Import phase, and both of them need one. This spec pins the behavior a
 * rep gets today so a fix shows up here as a failing assertion rather than as
 * a silent change. It asserts the current, broken output on purpose. Do not
 * "fix" these expectations by changing src/routes/onboarding.
 *
 * Reference: docs/preflight-ux-review.md M3 and G4.
 */
const PRODUCTS_CSV = 'style number,name,wholesale price\nSTYLE-1,Preflight Test Product,100\n';
const ORDERS_CSV = 'account,style number,qty\nPreflight Test Account,STYLE-1,2\n';

test('rep hits a dead end on the catalog step and a raw backend error on orders', async ({
	page
}) => {
	test.info().annotations.push({
		type: 'known-defect',
		description:
			'Rep orgs have no self-brand, so the products step refuses the upload and ' +
			'the orders step returns a 404 whose raw message reaches the user. ' +
			'See docs/preflight-ux-review.md M3.'
	});

	const watch = new ConsoleWatch(page);
	const shots = new Shots('rep-dead-ends');

	await signIn(page, PERSONA_EMAILS.repDeadEnd);

	await walkPreflight(page, REP_STEPS, shots, {
		displayName: PERSONA_DISPLAY_NAMES.repDeadEnd,
		orgName: PERSONA_ORG_NAMES.repDeadEnd,
		orgType: 'rep',
		stopAfterQuestion: 'products'
	});

	// ── Catalog step ──────────────────────────────────────────────────────
	// The step renders normally. The dead end only appears once a file is
	// offered, which is why a render-only assertion would miss it.
	await fileInput(page).setInputFiles({
		name: 'products.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(PRODUCTS_CSV)
	});

	await expect(errorLine(page)).toHaveText(
		"Product imports need a brand catalog — that's only set up for brand organizations right now."
	);
	await shots.take(page, 'products-dead-end');

	// ── Orders step ───────────────────────────────────────────────────────
	await skipButton(page).click();
	await expectQuestion(page, QUESTIONS.orders);

	// No client guard here at all, so the rep gets all the way to a preview.
	await fileInput(page).setInputFiles({
		name: 'orders.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(ORDERS_CSV)
	});
	await expect(page.getByText(/^I found /)).toBeVisible();
	await shots.take(page, 'orders-preview');

	await page.getByRole('button', { name: 'Import them' }).click();

	// api/orders/import resolves the org's self-brand and 404s with this exact
	// string, which the panel prints to the user unmodified.
	await expect(errorLine(page)).toHaveText('No self-brand found for this organization');
	await shots.take(page, 'orders-dead-end');

	// The 404 above is expected and is the evidence for this test, so the
	// console assertion allows it and nothing else.
	const unexpected = watch.problems.filter((p) => !/status of 404/.test(p));
	expect(unexpected, 'unexpected browser console errors').toEqual([]);
	expect(watch.problems.join('\n')).toMatch(/404/);
});
