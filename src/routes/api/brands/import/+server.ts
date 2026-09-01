import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { brandImportSchema, type BrandImportResult } from '$lib/schemas/brand-import.js';

// Bulk brand import endpoint. Called from the preflight "brands" step after
// the rep previews their CSV.
//
// Permission gate: matches the brands write path in /brands/new (admin/owner/
// member of the org). Rows are always inserted against the caller's own org —
// organization_id is never taken from the payload.
//
// Dedupe strategy: there's no UNIQUE (organization_id, name) constraint on
// `brands`, so we do an app-level case-insensitive lookup of existing names
// for the org and skip rows that already exist. Skipped rows aren't errors.
//
// The inserted ids come back in the response: the preflight step offers a
// per-brand connect action, and /api/connections/request needs the local
// brands.id as `repBrandId` to attach the connection to the right row.

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

	const parsed = brandImportSchema.safeParse(body);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return json({ error: first?.message ?? 'Invalid payload' }, { status: 400 });
	}

	const { brands } = parsed.data;
	const orgId = locals.organization.id;

	const { data: existingRows, error: existingErr } = await supabaseAdmin
		.from('brands')
		.select('name')
		.eq('organization_id', orgId);
	if (existingErr) {
		return json({ error: existingErr.message }, { status: 500 });
	}
	const existingNames = new Set((existingRows ?? []).map((r) => (r.name ?? '').toLowerCase()));

	const result: BrandImportResult & { brands: { id: string; name: string }[] } = {
		created: 0,
		skipped: [],
		errors: [],
		brands: []
	};

	const toInsert: ((typeof brands)[number] & { organization_id: string; is_active: boolean })[] =
		[];
	for (const row of brands) {
		if (existingNames.has(row.name.toLowerCase())) {
			result.skipped.push({ name: row.name, reason: 'Brand with this name already exists' });
			continue;
		}
		// Mark as seen so duplicates within the same file also dedupe.
		existingNames.add(row.name.toLowerCase());
		toInsert.push({ ...row, organization_id: orgId, is_active: true });
	}

	if (toInsert.length > 0) {
		const { data: inserted, error: insertErr } = await supabaseAdmin
			.from('brands')
			.insert(toInsert)
			.select('id, name');
		if (insertErr) {
			return json({ error: insertErr.message }, { status: 500 });
		}
		const rows = (inserted ?? []) as { id: string; name: string }[];
		result.created = rows.length;
		result.brands = rows;
	}

	return json(result);
};
