import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env parser. The e2e suite runs under Playwright's own node
 * process with no SvelteKit env plugin, so $env/static/* is unavailable
 * and we read the file directly. Same approach as tests/rls/setup/env.ts.
 */
function parseEnvFile(path: string): Record<string, string> {
	const out: Record<string, string> = {};
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return out;
	}
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		const quoted =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"));
		if (quoted) value = value.slice(1, -1);
		out[key] = value;
	}
	return out;
}

const fileEnv = parseEnvFile(resolve(process.cwd(), '.env'));

function required(key: string): string {
	const value = process.env[key] ?? fileEnv[key];
	if (!value) {
		throw new Error(`e2e tests: missing ${key}. Set it in .env or the environment.`);
	}
	return value;
}

export const SUPABASE_URL = required('PUBLIC_SUPABASE_URL');
export const ANON_KEY = required('PUBLIC_SUPABASE_ANON_KEY');
export const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');

const host = new URL(SUPABASE_URL).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
	throw new Error(
		`e2e tests refuse to run against ${SUPABASE_URL}. ` +
			'This suite creates and deletes auth users and organizations. Local Supabase only.'
	);
}

/**
 * Mailpit (the local Supabase mail catcher, still called `inbucket` in
 * supabase/config.toml) serves its web UI and REST API on 54324 on the same
 * host as the API. The sign-in helper reads the one-time code out of it.
 */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? `http://${host}:54324`;

/** Dev server port for the suite. Deliberately not 5173 so an already-open
 * `bun run dev` is never hijacked or collided with. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 5175);
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Every fixture auth user lives on this domain so teardown can find them
 * and can never match a real address. */
export const E2E_EMAIL_DOMAIN = 'e2e-preflight.threadline.local';

/** Every organization the suite creates is named with this prefix so teardown
 * is exact and can never match a real organization. */
export const E2E_ORG_NAME_PREFIX = 'E2E Preflight';

export function fixtureEmail(handle: string): string {
	return `${handle}@${E2E_EMAIL_DOMAIN}`;
}
