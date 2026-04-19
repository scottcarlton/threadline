import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, user, organization } = locals;

	if (!user || !organization) {
		throw redirect(303, '/login');
	}

	const { data: intakes } = await supabase
		.from('email_intakes')
		.select('id, from_email, subject, status, created_at, needs_review_reasons, order_id')
		.eq('organization_id', organization.id)
		.in('status', ['needs_review', 'needs_routing'])
		.order('created_at', { ascending: false })
		.limit(50);

	return {
		intakes: (intakes ?? []) as Array<{
			id: string;
			from_email: string;
			subject: string | null;
			status: string;
			created_at: string;
			needs_review_reasons: Array<{ lineIndex: number | null; reason: string }> | null;
			order_id: string | null;
		}>
	};
};
