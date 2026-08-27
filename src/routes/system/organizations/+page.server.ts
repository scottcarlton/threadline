import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

/**
 * Every org on the platform. This is a deliberate cross-tenant view, which is
 * why it lives under /system: the layout gate (`+layout.server.ts`) already
 * rejected anyone without `locals.isSystemAdmin` before this load runs, and
 * `supabaseAdmin` is only reachable after that gate.
 */
export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';

	let query = supabaseAdmin
		.from('organizations')
		.select('id, name, slug, org_type, created_at, organization_members(count)')
		.order('created_at', { ascending: false })
		.limit(200);

	if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);

	const { data, error } = await query;
	if (error) throw error;

	// PostgREST returns an embedded aggregate as `[{ count: n }]`.
	type OrgRow = {
		id: string;
		name: string;
		slug: string;
		org_type: string;
		created_at: string;
		organization_members: { count: number }[] | { count: number } | null;
	};

	const organizations = ((data ?? []) as OrgRow[]).map((org) => {
		const embedded = org.organization_members;
		const memberCount = Array.isArray(embedded)
			? (embedded[0]?.count ?? 0)
			: (embedded?.count ?? 0);
		return {
			id: org.id,
			name: org.name,
			slug: org.slug,
			orgType: org.org_type,
			createdAt: org.created_at,
			memberCount
		};
	});

	return { organizations, q };
};
