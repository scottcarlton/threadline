import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPublicRoute } from './public-routes';

const ROUTES = join(import.meta.dirname, '../../routes');

/** Every `+server.ts` under a routes subdirectory, as a URL path. */
function endpointsUnder(dir: string): string[] {
	const out: string[] = [];
	const walk = (d: string) => {
		for (const name of readdirSync(d)) {
			const full = join(d, name);
			if (statSync(full).isDirectory()) walk(full);
			else if (name === '+server.ts') out.push('/' + relative(ROUTES, d).split(sep).join('/'));
		}
	};
	walk(join(ROUTES, dir));
	return out;
}

describe('isPublicRoute', () => {
	// Machines call these without a session. A login redirect means the cron
	// never runs and providers see a 303 instead of the endpoint.
	it.each([...endpointsUnder('api/cron'), ...endpointsUnder('api/webhooks')])(
		'lets %s through without a session',
		(path) => {
			expect(isPublicRoute(path)).toBe(true);
		}
	);

	it('finds the machine endpoints it is guarding', () => {
		expect(endpointsUnder('api/cron')).toContain('/api/cron/agent-triggers');
		expect(endpointsUnder('api/webhooks')).toContain('/api/webhooks/messaging');
	});

	it.each(['/api/cronjobs', '/api/webhooksettings', '/api/orders', '/orders', '/'])(
		'keeps %s behind sign-in',
		(path) => {
			expect(isPublicRoute(path)).toBe(false);
		}
	);
});
