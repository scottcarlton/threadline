/**
 * Preflight: compares the migration versions recorded in
 * supabase_migrations.schema_migrations against the migration files present
 * in supabase/migrations/ in the working tree, and fails fast with an
 * actionable message on divergence.
 *
 * Why this exists: the local Supabase instance is one shared Postgres
 * database used by roughly 180 worktrees and several concurrent sessions.
 * It drifts from any one branch's migrations silently -- another session's
 * `supabase db reset`, a rolled-back migration, or simply being mid-way
 * through applying a newer migration set. When that happens, RLS suite
 * failures show up far from the real cause (a missing column, a missing
 * table, a stale PostgREST schema cache) and look like a broken branch when
 * the branch is fine. This check surfaces that drift at the very start of
 * the run instead of letting it masquerade as a test failure deep in the
 * suite.
 *
 * Split: missing-from-database fails the run, because tests would go on to
 * assert against schema that genuinely is not there -- that failure mode is
 * confusing and wastes time chasing the wrong cause. Missing-from-branch
 * (the database has migrations this branch's files do not) only warns,
 * because in this multi-worktree setup it is common and benign: another
 * worktree may simply have applied a newer migration to the same shared
 * database. Failing on that case would make the suite unusable for anyone
 * whose worktree is not the newest one running.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPABASE_URL } from './env.js';

const MIGRATION_VERSION_RE = /^(\d{14})_.+\.sql$/;

function readBranchMigrationVersions(migrationsDir: string): Set<string> {
	let entries: string[];
	try {
		entries = readdirSync(migrationsDir);
	} catch (err) {
		throw new Error(
			`RLS suite preflight: could not read ${migrationsDir}: ${(err as Error).message}`,
			{
				cause: err
			}
		);
	}
	const versions = new Set<string>();
	for (const entry of entries) {
		const match = entry.match(MIGRATION_VERSION_RE);
		if (match) versions.add(match[1]);
	}
	return versions;
}

function localDbUrl(): string {
	// The local Supabase database always runs on the standard local
	// credentials (postgres/postgres) at the fixed CLI-managed db port. env.ts
	// already refuses to run this suite against anything but 127.0.0.1 /
	// localhost, so it is safe to reuse that host here rather than parsing a
	// second config source. Overridable for the rare case a developer's local
	// stack uses a non-default db port.
	if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
	const host = new URL(SUPABASE_URL).hostname;
	const port = process.env.SUPABASE_DB_PORT ?? '54322';
	return `postgres://postgres:postgres@${host}:${port}/postgres`;
}

function readDatabaseMigrationVersions(): Set<string> {
	const supabaseBin = resolve(process.cwd(), 'node_modules/.bin/supabase');
	const dbUrl = localDbUrl();

	let stdout: string;
	try {
		stdout = execFileSync(
			supabaseBin,
			[
				'db',
				'query',
				'select version from supabase_migrations.schema_migrations order by version',
				'--db-url',
				dbUrl,
				'-o',
				'json',
				'--agent=no'
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(
			`RLS suite preflight: could not read applied migrations from the local database.\n` +
				`Is local Supabase running? Try: bunx supabase status\n\n${detail}`,
			{ cause: err }
		);
	}

	let rows: Array<{ version: string }>;
	try {
		rows = JSON.parse(stdout);
	} catch {
		throw new Error(
			`RLS suite preflight: could not parse migration query output as JSON:\n${stdout}`
		);
	}
	return new Set(rows.map((row) => row.version));
}

/**
 * Throws with an actionable message if the branch has migrations the shared
 * database has not applied. Warns (does not throw) if the database has
 * migrations the branch does not have -- see file header for the reasoning.
 */
export function checkMigrationDrift(
	migrationsDir: string = resolve(process.cwd(), 'supabase/migrations')
): void {
	const branchVersions = readBranchMigrationVersions(migrationsDir);
	const dbVersions = readDatabaseMigrationVersions();

	const missingFromDb = [...branchVersions].filter((v) => !dbVersions.has(v)).sort();
	const missingFromBranch = [...dbVersions].filter((v) => !branchVersions.has(v)).sort();

	if (missingFromBranch.length > 0) {
		console.warn(
			`\n[RLS suite] Warning: the shared local database has applied ${missingFromBranch.length} migration(s) not present in this branch's supabase/migrations/:\n` +
				missingFromBranch.map((v) => `  - ${v}`).join('\n') +
				`\n\nThis is expected when another worktree or session has applied newer migrations to the ` +
				`shared local database. If your branch is supposed to include these, pull/rebase from dev. ` +
				`Continuing.\n`
		);
	}

	if (missingFromDb.length > 0) {
		throw new Error(
			`\n[RLS suite] BLOCKED: the shared local database is missing ${missingFromDb.length} migration(s) that exist in this branch's supabase/migrations/:\n` +
				missingFromDb.map((v) => `  - ${v}`).join('\n') +
				`\n\nRunning the suite now would assert against schema that is not actually there, and the ` +
				`resulting failures would look like a broken branch far from this real cause. This usually ` +
				`means the shared local database drifted since you last synced -- another session reset it, ` +
				`rolled a migration back, or you have new migrations on this branch that were never applied ` +
				`locally.\n\n` +
				`Fix: run \`bun run migrate\` (bunx supabase migration up) to apply the missing migrations, ` +
				`then re-run \`bun run test:rls\`.\n\n` +
				`Do NOT run \`bunx supabase db reset\` -- this database is shared across every worktree and ` +
				`a reset wipes everyone's data, not just this branch's state.\n`
		);
	}
}
