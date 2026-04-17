import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listConnectedReps, type ConnectedRep } from '$lib/server/federation.js';

type RepConnectionRow = {
	id: string;
	brand_org_id: string;
	rep_brand_id: string | null;
	status: 'pending' | 'active' | 'suspended' | 'disconnected';
	commission_rate: number | null;
	connected_at: string | null;
	created_at: string;
	brand_org: { id: string; name: string; slug: string | null } | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, organization, orgType, membership } = locals;
	if (!organization || !membership) throw redirect(303, '/insight');

	const orgId = organization.id;
	const isAdmin = ['admin', 'owner'].includes(membership.role);

	if (orgType === 'brand') {
		// Admin client: federation joins touch rep-org tables whose RLS excludes the brand.
		// Security guarantee is preserved by the brand_org_id filter inside the helper.
		const connectedReps = await listConnectedReps(supabaseAdmin, orgId);

		let invites: Array<{
			id: string;
			code: string;
			expires_at: string;
			max_uses: number;
			use_count: number;
			auto_approve: boolean;
			created_at: string;
		}> = [];
		if (isAdmin) {
			const { data } = await supabase
				.from('connection_invites')
				.select('id, code, expires_at, max_uses, use_count, auto_approve, created_at')
				.eq('brand_org_id', orgId)
				.order('created_at', { ascending: false });
			invites = data ?? [];
		}

		return {
			orgType,
			isAdmin,
			connectedReps,
			invites,
			// rep-only fields kept empty so the type stays stable
			repConnections: [] as RepConnectionRow[],
			brands: [] as Array<{ id: string; name: string }>
		};
	}

	// Rep org view: their connections + the brands they carry (for mapping when joining)
	const { data: connectionsRaw } = await supabaseAdmin
		.from('org_connections')
		.select(
			'id, brand_org_id, rep_brand_id, status, commission_rate, connected_at, created_at, brand_org:brand_org_id(id, name, slug)'
		)
		.eq('rep_org_id', orgId)
		.order('created_at', { ascending: false });

	const repConnections = (connectionsRaw ?? []) as unknown as RepConnectionRow[];

	const { data: brandsData } = await supabase
		.from('brands')
		.select('id, name')
		.eq('organization_id', orgId)
		.eq('is_active', true)
		.order('name');

	return {
		orgType,
		isAdmin,
		connectedReps: [] as ConnectedRep[],
		invites: [] as Array<{
			id: string;
			code: string;
			expires_at: string;
			max_uses: number;
			use_count: number;
			auto_approve: boolean;
			created_at: string;
		}>,
		repConnections,
		brands: brandsData ?? []
	};
};
