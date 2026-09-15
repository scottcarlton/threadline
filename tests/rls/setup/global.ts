import { seedRlsFixture, teardownRlsFixture } from './fixture.js';
import { checkMigrationDrift } from './migration-drift.js';

export async function setup(): Promise<void> {
	// Fail fast, and with an actionable message, if the shared local database
	// has drifted from this branch's migrations -- see migration-drift.ts.
	checkMigrationDrift();

	// Idempotent: clear anything a crashed previous run left behind, then seed.
	await teardownRlsFixture();
	await seedRlsFixture();
}

export async function teardown(): Promise<void> {
	await teardownRlsFixture();
}
