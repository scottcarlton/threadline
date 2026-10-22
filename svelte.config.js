import adapter from '@sveltejs/adapter-vercel';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		adapter: adapter(),
		experimental: {
			// Run src/instrumentation.server.ts before the app, and emit spans for
			// handle, load, actions, and remote functions. Sentry picks both up.
			instrumentation: { server: true },
			tracing: { server: true }
		}
	}
};

export default config;
