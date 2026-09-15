/**
 * Seed or clear the end-to-end preflight fixture.
 *
 *   bun run test:e2e:seed     reset (teardown, then seed)
 *   bun run test:e2e:clean    teardown only
 *
 * The Playwright run does this itself in globalSetup/globalTeardown. This
 * script exists for the times you want the users to stay around: driving the
 * flow by hand, or clearing up after a run you killed halfway.
 */
import {
	PERSONA_EMAILS,
	seedE2EFixture,
	teardownE2EFixture,
	type E2EPersona
} from '../tests/e2e/setup/fixture.js';

const teardownOnly = process.argv.includes('--teardown');

await teardownE2EFixture();
console.log('e2e fixture: cleared');

if (!teardownOnly) {
	await seedE2EFixture();
	console.log('e2e fixture: seeded');
	for (const persona of Object.keys(PERSONA_EMAILS) as E2EPersona[]) {
		console.log(`  ${persona.padEnd(12)} ${PERSONA_EMAILS[persona]}`);
	}
	console.log('\nSign in at /login with "Continue with Email". The code lands in');
	console.log('the local mail catcher at http://127.0.0.1:54324.');
}
