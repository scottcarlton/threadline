import tailwindcss from '@tailwindcss/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		plugins: [
			tailwindcss(),
			sentrySvelteKit({
				sourceMapsUploadOptions: {
					org: 'scott-carlton',
					project: 'threadline',
					authToken: env.SENTRY_AUTH_TOKEN
				}
			}),
			sveltekit()
		],
		server: {
			port: 5173,
			strictPort: true
		}
	};
});
