import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { supabase, user, organization } = locals;

	if (!user || !organization) {
		throw redirect(303, '/login');
	}

	const { data: intake } = await supabase
		.from('email_intakes')
		.select('*')
		.eq('id', params.intake_id)
		.eq('organization_id', organization.id)
		.single();

	if (!intake) {
		throw error(404, 'Intake not found');
	}

	const { data: lineResolutions } = await supabase
		.from('email_intake_line_resolutions')
		.select('*, products(name)')
		.eq('intake_id', params.intake_id)
		.order('line_index');

	return {
		intake: intake as {
			id: string;
			from_email: string;
			to_email: string;
			subject: string | null;
			message_id: string;
			provider_email_id: string;
			email_body: string | null;
			parsed_json: Record<string, unknown> | null;
			status: string;
			order_id: string | null;
			error_reason: string | null;
			needs_review_reasons: Array<{ lineIndex: number | null; reason: string }> | null;
			created_at: string;
		},
		lineResolutions: (lineResolutions ?? []) as Array<{
			id: string;
			line_index: number;
			raw_text: string;
			matched_product_id: string | null;
			confidence: number | null;
			issues: Array<{ code: string; detail: string }> | null;
			products: { name: string } | null;
		}>,
		emailBody: (intake as { email_body?: string | null }).email_body ?? null
	};
};

export const actions: Actions = {
	approve: async ({ params, locals }) => {
		const { user, organization } = locals;
		if (!user || !organization) return fail(401);

		const { data: intake } = await supabaseAdmin
			.from('email_intakes')
			.select('id, order_id, status')
			.eq('id', params.intake_id)
			.eq('organization_id', organization.id)
			.single();

		if (!intake || !intake.order_id) {
			return fail(404, { message: 'Intake or order not found' });
		}

		if (intake.status !== 'needs_review') {
			return fail(400, { message: 'Intake is not in review status' });
		}

		const { error: orderError } = await supabaseAdmin
			.from('orders')
			.update({ status: 'submitted', submitted_at: new Date().toISOString() })
			.eq('id', intake.order_id);

		if (orderError) {
			return fail(500, { message: 'Failed to submit order' });
		}

		await supabaseAdmin
			.from('email_intakes')
			.update({ status: 'submitted', needs_review_reasons: null })
			.eq('id', intake.id);

		throw redirect(303, '/orders/review');
	},

	reject: async ({ params, locals }) => {
		const { user, organization } = locals;
		if (!user || !organization) return fail(401);

		const { data: intake } = await supabaseAdmin
			.from('email_intakes')
			.select('id, order_id, status')
			.eq('id', params.intake_id)
			.eq('organization_id', organization.id)
			.single();

		if (!intake) {
			return fail(404, { message: 'Intake not found' });
		}

		if (intake.order_id) {
			await supabaseAdmin.from('orders').delete().eq('id', intake.order_id);
		}

		await supabaseAdmin
			.from('email_intakes')
			.update({ status: 'rejected', order_id: null })
			.eq('id', intake.id);

		throw redirect(303, '/orders/review');
	}
};
