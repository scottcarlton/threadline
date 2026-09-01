import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/rls/**/*.test.ts'],
		environment: 'node',
		globals: true,
		// One shared fixture in one database. Parallel files would race.
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 30_000,
		hookTimeout: 120_000,
		globalSetup: ['tests/rls/setup/global.ts']
	}
});
