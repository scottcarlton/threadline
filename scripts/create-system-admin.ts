#!/usr/bin/env bun
/**
 * Provision the above-org system administrator account.
 *
 * The application already recognises the system-admin identity
 * (`src/lib/server/system-admin.ts` → `locals.isSystemAdmin` → `/system`), but
 * the auth user itself has to exist and clear the beta whitelist gate in
 * `hooks.server.ts`. This script does exactly that, idempotently, so it is safe
 * to re-run against any environment.
 *
 * Unlike `seed-demo.ts` this is allowed to target a remote project, because
 * provisioning the production admin is its whole purpose. It therefore prints
 * the target and requires confirmation before writing to a non-local database.
 *
 * Usage:
 *   bun run admin:create                       # provision every allow-listed email
 *   SYSTEM_ADMIN_PASSWORD='…' bun run admin:create
 *   bun run admin:create -- --yes              # skip the remote confirmation
 *
 * Emails come from SYSTEM_ADMIN_ALLOWLIST, never from an argument, so the
 * account provisioned and the account the gate trusts cannot drift apart.
 */
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_ADMIN_ALLOWLIST } from '../src/lib/server/system-admin.js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
	process.exit(1);
}

const isLocal = /127\.0\.0\.1|localhost/.test(SUPABASE_URL);
const autoYes = process.argv.includes('--yes');

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

/** Strong random password, used when none is supplied. Printed once. */
function generatePassword(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function confirmRemote(): Promise<void> {
	if (isLocal || autoYes) return;
	console.warn(`\n  Target is NOT local: ${SUPABASE_URL}`);
	console.warn(
		'  This will create or update a super-admin account with full cross-org read access.'
	);
	process.stdout.write('  Type "yes" to continue: ');

	for await (const line of console) {
		if (line.trim().toLowerCase() === 'yes') return;
		console.error('Aborted.');
		process.exit(1);
	}
	process.exit(1);
}

async function findUserId(email: string): Promise<string | null> {
	// The repo already ships this RPC (migration 20260527000002); supabase-js has
	// no getUserByEmail, and paging listUsers would not scale.
	// Signature: get_user_id_by_email(lookup_email text) RETURNS TABLE(id uuid).
	const { data, error } = await supa.rpc('get_user_id_by_email', { lookup_email: email });
	if (error) throw new Error(`lookup failed for ${email}: ${error.message}`);
	const rows = (data ?? []) as Array<{ id: string }>;
	return rows[0]?.id ?? null;
}

async function provision(email: string): Promise<void> {
	const displayName = 'Scott Carlton';
	let password: string | null = null;

	let userId = await findUserId(email);

	if (userId) {
		console.log(`  user exists          ${email} (${userId})`);
	} else {
		password = process.env.SYSTEM_ADMIN_PASSWORD || generatePassword();
		const { data, error } = await supa.auth.admin.createUser({
			email,
			password,
			email_confirm: true
		});
		if (error || !data.user) throw new Error(`create failed for ${email}: ${error?.message}`);
		userId = data.user.id;
		console.log(`  user created         ${email} (${userId})`);
	}

	// Profile: `loadUserContext` reads it for the display name in /system.
	const { error: profileError } = await supa
		.from('profiles')
		.upsert({ id: userId, display_name: displayName }, { onConflict: 'id' });
	if (profileError) throw new Error(`profile upsert failed: ${profileError.message}`);
	console.log('  profile ensured');

	// Beta whitelist: without this the gate in hooks.server.ts signs the session
	// straight back out with ?error=beta_not_whitelisted.
	const { error: whitelistError } = await supa
		.from('beta_whitelist')
		.upsert(
			{ email, notes: 'System administrator (provisioned by scripts/create-system-admin.ts)' },
			{ onConflict: 'email' }
		);
	if (whitelistError) throw new Error(`whitelist upsert failed: ${whitelistError.message}`);
	console.log('  whitelist ensured');

	// Deliberately no organization_members row: the system admin is an above-org
	// identity. Giving it a membership would put it inside a tenant and change
	// how every org-scoped query treats it.

	if (password) {
		console.log(`\n  Password (shown once): ${password}`);
		console.log('  Store it in a password manager now, then sign in at /login.');
	} else {
		console.log('\n  Existing account left untouched. Use password reset if you need access.');
	}
}

console.log(`\nProvisioning system admin against ${SUPABASE_URL}`);
await confirmRemote();

for (const email of SYSTEM_ADMIN_ALLOWLIST) {
	console.log(`\n${email}`);
	await provision(email);
}

console.log('\nDone. Sign in at /login; you will be redirected to /system.\n');
