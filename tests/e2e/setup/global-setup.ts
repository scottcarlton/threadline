import { seedE2EFixture, teardownE2EFixture } from './fixture.js';

/**
 * Idempotent: clear anything a crashed previous run left behind, then seed.
 * Same shape as tests/rls/setup/global.ts.
 */
export default async function globalSetup(): Promise<void> {
	await teardownE2EFixture();
	await seedE2EFixture();
}
