import { teardownE2EFixture } from './fixture.js';

export default async function globalTeardown(): Promise<void> {
	await teardownE2EFixture();
}
