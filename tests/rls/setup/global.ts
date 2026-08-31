import { seedRlsFixture, teardownRlsFixture } from './fixture.js';

export async function setup(): Promise<void> {
	// Idempotent: clear anything a crashed previous run left behind, then seed.
	await teardownRlsFixture();
	await seedRlsFixture();
}

export async function teardown(): Promise<void> {
	await teardownRlsFixture();
}
