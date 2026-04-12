import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { supabase } = locals;

	const [agentResult, triggersResult, runsResult] = await Promise.all([
		supabase
			.from('org_agents')
			.select('*, profiles!org_agents_created_by_fkey(display_name)')
			.eq('id', params.id)
			.single(),
		supabase
			.from('org_agent_triggers')
			.select('*')
			.eq('agent_id', params.id)
			.order('created_at', { ascending: false }),
		supabase
			.from('org_agent_runs')
			.select('*')
			.eq('agent_id', params.id)
			.order('started_at', { ascending: false })
			.limit(20)
	]);

	if (agentResult.error || !agentResult.data) {
		throw error(404, 'Agent not found');
	}

	return {
		agent: agentResult.data,
		triggers: triggersResult.data ?? [],
		runs: runsResult.data ?? []
	};
};
