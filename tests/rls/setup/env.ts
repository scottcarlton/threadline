import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env parser. The RLS suite runs under plain vitest with no
 * SvelteKit env plugin, so $env/static/* is unavailable and we read the
 * file directly. No dependency added for this.
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
		throw new Error(`RLS tests: missing ${key}. Set it in .env or the environment.`);
	}
	return value;
}

export const SUPABASE_URL = required('PUBLIC_SUPABASE_URL');
export const ANON_KEY = required('PUBLIC_SUPABASE_ANON_KEY');
export const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');

const host = new URL(SUPABASE_URL).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
	throw new Error(
		`RLS tests refuse to run against ${SUPABASE_URL}. ` +
			'This suite creates and deletes auth users and org data. Local Supabase only.'
	);
}

/** All fixture auth users live on this domain so teardown can find them. */
export const FIXTURE_EMAIL_DOMAIN = 'rls-test.threadline.local';
export const FIXTURE_PASSWORD = 'rls-test-pw!';

export function fixtureEmail(handle: string): string {
	return `${handle}@${FIXTURE_EMAIL_DOMAIN}`;
}
