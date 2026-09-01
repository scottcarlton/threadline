import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { fetchActivity, describeAuditRow } from '$lib/server/audit/query.js';

export const load: PageServerLoad = async ({ locals }) => {
	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

	const [orgCount, memberCount, recent, failures] = await Promise.all([
		supabaseAdmin.from('organizations').select('id', { count: 'exact', head: true }),
		supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
		fetchActivity({ limit: 20, excludeSystemActors: true }),
		supabaseAdmin
			.from('audit_log')
			.select('id', { count: 'exact', head: true })
			.eq('status', 'failure')
			// Matches the timeline below: an admin's own failed console reads are
			// not what this counter is asking about.
			.neq('actor_kind', 'system_admin')
			.gte('created_at', dayAgo)
	]);

	return {
		user: locals.user,
		stats: {
			organizations: orgCount.count ?? 0,
			users: memberCount.count ?? 0,
			failuresToday: failures.count ?? 0
		},
		activity: recent.rows.map((row) => ({ ...row, description: describeAuditRow(row) }))
	};
};
