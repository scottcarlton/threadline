import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		globals: true,
		alias: {
			$lib: resolve('./src/lib'),
			'$lib/server': resolve('./src/lib/server'),
			'$app/environment': resolve('./src/lib/test-helpers/mock-app-environment.ts'),
			'$env/static/private': resolve('./src/lib/test-helpers/mock-env-private.ts'),
			'$env/static/public': resolve('./src/lib/test-helpers/mock-env-public.ts'),
			'$env/dynamic/private': resolve('./src/lib/test-helpers/mock-env-dynamic-private.ts')
		}
	}
});
