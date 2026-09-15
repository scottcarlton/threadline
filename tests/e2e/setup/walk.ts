import { expect, type Page } from '@playwright/test';
import {
	Shots,
	answerText,
	expectQuestion,
	questionCounter,
	skipButton,
	stepCounter
} from './preflight.js';
import { ORG_TYPE_LABELS, QUESTIONS } from './questions.js';

export type WalkOptions = {
	displayName: string;
	orgName: string;
	orgType: keyof typeof ORG_TYPE_LABELS;
	/** Stop before performing the action for this step. Used by the retailer
	 * walk, which ends at org creation, and by the dead-end spec. */
	stopAfterQuestion?: string;
};

/**
 * Walks the flow one step at a time, asserting the question copy at each and
 * screenshotting it before answering.
 *
 * Every optional step is skipped rather than filled in. That is deliberate:
 * the harness is here to prove which questions each org type is asked and in
 * what order, and an import that actually ingests rows would make the run
 * depend on parser behavior that has its own unit tests. The dead-end spec
 * covers the import paths that are known to be broken.
 *
 * Returns the counters observed at each step, so a spec can assert on how the
 * flow describes its own length.
 */
export async function walkPreflight(
	page: Page,
	steps: string[],
	shots: Shots,
	opts: WalkOptions
): Promise<{ step: string; stepCounter: string; questionCounter: string }[]> {
	const observed: { step: string; stepCounter: string; questionCounter: string }[] = [];

	for (const step of steps) {
		const question = QUESTIONS[step];
		if (!question) throw new Error(`walkPreflight: no question copy recorded for step "${step}"`);

		await expectQuestion(page, question);

		// A step that renders blank is the failure this catches: the panel keeps
		// its previous question on screen when the next one throws, and the
		// counters are the only thing that moves.
		const counters = {
			step,
			stepCounter: (await stepCounter(page).innerText()).trim(),
			questionCounter: (await questionCounter(page).innerText()).trim()
		};
		observed.push(counters);

		await shots.take(page, `${observed.length}-${step}`);

		if (opts.stopAfterQuestion === step) break;

		if (step === 'name') {
			await answerText(page, opts.displayName);
		} else if (step === 'orgType') {
			// The card's accessible name folds in its description, and the rep
			// description contains the word "brands", so a name match on "Brand"
			// is ambiguous. Match the label span exactly instead.
			await page
				.getByRole('button')
				.filter({ has: page.getByText(ORG_TYPE_LABELS[opts.orgType], { exact: true }) })
				.click();
		} else if (step === 'orgName') {
			await answerText(page, opts.orgName);
		} else {
			await expect(skipButton(page)).toBeVisible();
			await skipButton(page).click();
		}
	}

	return observed;
}
