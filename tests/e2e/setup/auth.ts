import { expect, type Page } from '@playwright/test';
import { clearMailbox, waitForSignInCode } from './mailpit.js';

/**
 * Why the real login UI and a real emailed code, rather than minting a
 * session with the admin API and injecting cookies:
 *
 * Threadline has no password login. `src/routes/(auth)/login/+page.svelte`
 * is email OTP only (`signInWithOtp` then `verifyOtp`), and the session it
 * produces is written to cookies by @supabase/ssr's browser client. Hand
 * building those cookies means encoding @supabase/ssr's private cookie
 * format (name derivation, base64 prefix, chunking) in the test suite, where
 * it would silently break on any upgrade of that package and produce a
 * "logged out" failure that looks like an application bug. Driving the UI
 * lets @supabase/ssr write its own cookies in whatever shape it currently
 * uses, so the format is never our problem, and it covers the login path as
 * a side effect. The one thing the UI cannot supply is the code, and the
 * local mail catcher hands that over in well under a second.
 *
 * No change to supabase/config.toml is needed: [auth.email.test_otp] stays
 * unset, and the stock template already prints the code in the email body.
 */
export async function signIn(
	page: Page,
	email: string,
	opts: { expectUrl?: string } = {}
): Promise<void> {
	await clearMailbox(email);

	await page.goto('/login');

	// The login page is server-rendered before Svelte hydrates, so on a cold
	// dev server the first click can land on a button that is not wired up
	// yet and do nothing. Retry until the panel actually opens.
	const showOthers = page.getByRole('button', { name: 'Show other options' });
	const continueWithEmail = page.getByRole('button', { name: 'Continue with Email' });
	await expect(showOthers).toBeVisible();
	await expect(async () => {
		if (!(await continueWithEmail.isVisible())) await showOthers.click();
		await expect(continueWithEmail).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 60_000 });

	await continueWithEmail.click();
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Send sign-in code' }).click();

	await expect(page.getByText(`Enter the code sent to ${email}`)).toBeVisible();

	const code = await waitForSignInCode(email);

	// Bits UI PinInput renders one visually hidden input behind the cells and
	// distributes keystrokes across them, so the code is typed rather than
	// filled. `onComplete` submits on the sixth character.
	const pin = page.locator('input').first();
	await pin.focus();
	await pin.pressSequentially(code, { delay: 20 });

	// A user with no organization is routed to onboarding by hooks.server.ts,
	// whichever landing path the login page asked for. A user who already has
	// one lands wherever their org type belongs, so callers can override.
	await page.waitForURL(opts.expectUrl ?? '**/onboarding', { timeout: 30_000 });
}
