import { expect, test } from '@playwright/test';
import { signIn } from './setup/auth.js';
import { PERSONA_DISPLAY_NAMES, PERSONA_EMAILS } from './setup/fixture.js';
import { ConsoleWatch, Shots, answerText, expectQuestion } from './setup/preflight.js';
import { QUESTIONS } from './setup/questions.js';

/**
 * M5. The forward chevron used to be gated on array bounds alone, so it moved
 * the cursor without recording anything: a user could chevron past the name
 * question, past the org-type cards, type an organization name, and
 * create-org would coerce the missing type to 'rep'. The single most
 * consequential choice in the product, made by accident, in the wrong
 * direction.
 *
 * The chevron now only re-walks ground already covered.
 */
test('the forward chevron will not move past an unanswered question', async ({ page }) => {
	const watch = new ConsoleWatch(page);
	const shots = new Shots('chevron-gating');

	await signIn(page, PERSONA_EMAILS.chevronGate);

	const next = page.getByRole('button', { name: 'Next question' });
	const back = page.getByRole('button', { name: 'Previous question' });

	// First question, nothing answered. This is the exact state the old
	// bounds-only check allowed a user to walk out of.
	await expectQuestion(page, QUESTIONS.name);
	await expect(next).toBeDisabled();
	await expect(back).toBeDisabled();
	await shots.take(page, 'first-question-locked');

	// Answering it advances to the org-type question, which is itself
	// unanswered, so the chevron is closed again rather than opening up.
	await answerText(page, PERSONA_DISPLAY_NAMES.chevronGate);
	await expectQuestion(page, QUESTIONS.orgType);
	await expect(next).toBeDisabled();
	await shots.take(page, 'org-type-locked');

	// Going back to the answered question re-opens it, since that is ground
	// already covered.
	await expect(back).toBeEnabled();
	await back.click();
	await expectQuestion(page, QUESTIONS.name);
	await expect(next).toBeEnabled();
	await shots.take(page, 'answered-question-reopens');

	// And forward lands back on the org-type question rather than past it.
	await next.click();
	await expectQuestion(page, QUESTIONS.orgType);
	await expect(next).toBeDisabled();

	watch.assertClean();
});
