import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { accountImportSchema, type AccountImportResult } from '$lib/schemas/account-import.js';

// Bulk account import endpoint. Called from the /accounts AccountImport
// flow after the user previews their CSV.
//
// Permission gate: matches the accounts RLS write policy (admin/owner/
// member of the org).
//
// Dedupe strategy: there's no UNIQUE (organization_id, business_name)
// constraint on `accounts`, so we do an app-level case-insensitive
// lookup of existing business_names for the org and skip rows that
// already exist. Skipped rows aren't errors — they're a no-op the user
// gets a count of in the response.

const ALLOWED_ROLES = new Set(['admin', 'owner', 'member']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const role = locals.membership?.role;
	if (!role || !ALLOWED_ROLES.has(role)) {
		return json({ error: 'Insufficient permissions' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = accountImportSchema.safeParse(body);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return json({ error: first?.message ?? 'Invalid payload' }, { status: 400 });
	}

	const { accounts } = parsed.data;
	const orgId = locals.organization.id;

	// Pull all existing business_names for the org once and dedupe in
	// memory. Cheaper than per-row lookup.
	const { data: existingRows, error: existingErr } = await supabaseAdmin
		.from('accounts')
		.select('business_name')
		.eq('organization_id', orgId);
	if (existingErr) {
		return json({ error: existingErr.message }, { status: 500 });
	}
	const existingNames = new Set((existingRows ?? []).map((r) => r.business_name.toLowerCase()));

	const result: AccountImportResult = { created: 0, skipped: [], errors: [] };

	const toInsert: ((typeof accounts)[number] & { organization_id: string })[] = [];
	for (const row of accounts) {
		if (existingNames.has(row.business_name.toLowerCase())) {
			result.skipped.push({
				business_name: row.business_name,
				reason: 'Account with this business name already exists'
			});
			continue;
		}
		// Mark as seen so duplicates within the same import file also dedupe.
		existingNames.add(row.business_name.toLowerCase());
		toInsert.push({ ...row, organization_id: orgId });
	}

	if (toInsert.length > 0) {
		const { error: insertErr } = await supabaseAdmin.from('accounts').insert(toInsert);
		if (insertErr) {
			return json({ error: insertErr.message }, { status: 500 });
		}
		result.created = toInsert.length;
	}

	return json(result);
};
