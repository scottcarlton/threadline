import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, E2E_PORT } from './tests/e2e/setup/env.js';

/**
 * End-to-end harness for the onboarding ("preflight") flow.
 * Runbook: docs/testing-e2e.md.
 *
 * The suite drives one real dev server against local Supabase and creates and
 * deletes real auth users and organizations, so it never runs in parallel:
 * the three org-type walks share one database and one fixture.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/setup/global-setup.ts',
	globalTeardown: './tests/e2e/setup/global-teardown.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	// A full walk signs in through the real email OTP round trip and then
	// answers or skips up to twelve questions, each with a typewriter and a
	// screenshot.
	timeout: 180_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	outputDir: 'test-results',
	use: {
		baseURL: BASE_URL,
		// The onboarding right rail is `xl:block` and disappears below 1280,
		// so anything narrower would be testing a different page.
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }
		}
	],
	webServer: {
		// Not 5173: a dev server the developer already has open must be neither
		// hijacked nor collided with. --strictPort turns a collision into a
		// failure instead of a silent move to another port.
		// --host: vite otherwise binds localhost only, which on macOS can
		// resolve to ::1 alone and leaves 127.0.0.1 unreachable.
		command: `bunx vite dev --port ${E2E_PORT} --strictPort --host 127.0.0.1`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
