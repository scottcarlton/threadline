import { expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Locators for src/routes/onboarding/+page.svelte.
 *
 * The flow carries no test ids and none were added for this harness, so every
 * selector here is either a role/visible-text query or a structural one keyed
 * on a class combination that appears exactly once in the file. Where the
 * latter is used the line it pins is named, so a rename is a one-line fix
 * rather than a hunt.
 */

/** The typed question inside the conversation panel (+page.svelte:2121).
 * `leading-relaxed` appears once in the file, which is what makes this
 * unambiguous against the page's other zinc-50 paragraph. */
export const questionText = (page: Page): Locator => page.locator('p.leading-relaxed');

/** "Step N of M" above the roadmap (+page.svelte:1866). */
export const stepCounter = (page: Page): Locator => page.getByText(/^Step \d+ of \d+$/);

/** "Question N of M" in the panel header (+page.svelte:2056). */
export const questionCounter = (page: Page): Locator => page.getByText(/^Question \d+ of \d+$/);

/** Roadmap phase rows (+page.svelte:1879). One <ol> on the page. */
export const roadmapRows = (page: Page): Locator => page.locator('ol.space-y-5 > li');

/** The always-present prompt bar input (+page.svelte:2644). Identified by the
 * attach button that sits under it, so it never picks up the address step's
 * or the manual-brand form's inputs. */
export const promptInput = (page: Page): Locator =>
	page.locator('div:has(> div > button[aria-label="Attach file"]) > input');

export const skipButton = (page: Page): Locator =>
	page.getByRole('button', { name: 'Skip for now' });

/** The error line under the panel body (+page.svelte:2541). */
export const errorLine = (page: Page): Locator => page.locator('p.text-red-400');

/** Hidden file input behind the dropzone and the attach button. */
export const fileInput = (page: Page): Locator => page.locator('input[type="file"]');

/** Titles shown in the roadmap, top to bottom. */
export async function roadmapTitles(page: Page): Promise<string[]> {
	const rows = roadmapRows(page);
	await expect(rows.first()).toBeVisible();
	return rows.locator('p.font-semibold').allInnerTexts();
}

/**
 * Waits for a question to have finished typing itself out. The typewriter
 * reveals the step's controls only once the last character lands, so a
 * matched question text is also the signal that the step is interactive.
 */
export async function expectQuestion(page: Page, question: string): Promise<void> {
	await expect(questionText(page)).toHaveText(question, { timeout: 30_000 });
}

/** Types a free-text answer into the prompt bar and sends it. */
export async function answerText(page: Page, value: string): Promise<void> {
	await promptInput(page).fill(value);
	await promptInput(page).press('Enter');
}

/** Screenshots into a per-run artifacts directory, numbered in visit order. */
export class Shots {
	private n = 0;
	private readonly dir: string;

	constructor(run: string) {
		this.dir = resolve(process.cwd(), 'tests/e2e/artifacts', run);
		mkdirSync(this.dir, { recursive: true });
	}

	async take(page: Page, name: string): Promise<void> {
		this.n += 1;
		const slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const index = String(this.n).padStart(2, '0');
		await page.screenshot({ path: resolve(this.dir, `${index}-${slug}.png`), fullPage: true });
	}
}

/**
 * Collects browser console errors and unhandled page exceptions for the life
 * of a page. A step that throws while rendering still leaves the previous
 * question on screen, so a text assertion alone would not catch it: this is
 * what turns that into a failure.
 */
export class ConsoleWatch {
	readonly problems: string[] = [];

	constructor(page: Page) {
		page.on('console', (msg) => {
			if (msg.type() !== 'error') return;
			const text = msg.text();
			if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
			this.problems.push(`console.error: ${text}`);
		});
		page.on('pageerror', (err) => {
			this.problems.push(`pageerror: ${err.message}`);
		});
	}

	assertClean(): void {
		expect(this.problems, 'browser console errors and page exceptions').toEqual([]);
	}
}

/**
 * Noise the harness is not here to report. Keep this list short and keep every
 * entry justified: anything filtered here is a real console error that a
 * human would see.
 */
const IGNORED_CONSOLE: RegExp[] = [
	// Vite's dev-only websocket for HMR. Not part of the app.
	/\[vite\] (failed to connect|server connection lost)/i
];
