import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { organizationOrdersSchema } from '$lib/schemas/organization-orders.js';
import { brandTermsSchema } from '$lib/schemas/brand-terms.js';
import { requireAdmin } from '$lib/server/auth/require-admin.js';

type CurrentTerms = {
	id: string;
	brand_id: string;
	title: string;
	body: string;
	version: number;
	is_current: boolean;
	created_at: string | null;
	created_by: string | null;
};

type HistoryTerms = {
	id: string;
	version: number;
	title: string;
	created_at: string | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	// Org-level commerce settings are Brand-Org-only. Rep orgs configure
	// commerce per manual brand on /brands/[id]; the order resolver
	// branches on the brand's owning org_type. Defense-in-depth: the
	// sidebar already hides the link for rep orgs, but a rep admin who
	// hand-types the URL gets 404 here.
	if (locals.orgType !== 'brand') throw error(404, 'Not found');

	const { organization, orgType, supabase, membership } = locals;

	const form = await superValidate(zod4(organizationOrdersSchema));
	if (organization) {
		form.data.orderNumberPrefix = organization.order_number_prefix ?? '';
		form.data.nextOrderNumber = organization.next_order_number ?? 1;
		form.data.orderNumberPadWidth = organization.order_number_pad_width ?? 0;
		form.data.orderMinimumEnabled = organization.order_minimum_enabled ?? false;
		form.data.orderMinimumAmount = Number(organization.order_minimum_amount ?? 0);
		form.data.defaultCommissionRate = Number(organization.default_commission_rate ?? 10);
		form.data.handlingFeeAmount = Number(organization.handling_fee_amount ?? 0);
	}

	// Buyer terms relocated here from /organization (Phase 7).
	let selfBrand: { id: string } | null = null;
	if (orgType === 'brand' && organization) {
		const { data } = await supabase
			.from('brands')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('is_self_brand', true)
			.maybeSingle();
		selfBrand = data ?? null;
	}

	const canEditTerms =
		orgType === 'brand' &&
		!!selfBrand &&
		!!membership &&
		['admin', 'owner'].includes(membership.role);

	let currentTerms: CurrentTerms | null = null;
	let termsHistory: HistoryTerms[] = [];

	if (canEditTerms && selfBrand) {
		const [currentRes, historyRes] = await Promise.all([
			supabaseAdmin
				.from('brand_terms')
				.select('id, brand_id, title, body, version, is_current, created_at, created_by')
				.eq('brand_id', selfBrand.id)
				.eq('is_current', true)
				.maybeSingle(),
			supabaseAdmin
				.from('brand_terms')
				.select('id, version, title, created_at, is_current')
				.eq('brand_id', selfBrand.id)
				.eq('is_current', false)
				.order('version', { ascending: false })
		]);

		currentTerms = (currentRes.data as CurrentTerms | null) ?? null;
		termsHistory = (historyRes.data ?? []) as HistoryTerms[];
	}

	const termsForm = await superValidate(zod4(brandTermsSchema));
	if (canEditTerms && selfBrand) {
		termsForm.data.brand_id = selfBrand.id;
		termsForm.data.title = currentTerms?.title ?? 'Terms & Conditions';
		termsForm.data.body = currentTerms?.body ?? '';
	}

	return { form, canEditTerms, currentTerms, termsHistory, termsForm };
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const form = await superValidate(request, zod4(organizationOrdersSchema));
		if (!form.valid) return fail(400, { form });

		try {
			const update = {
				order_number_prefix: form.data.orderNumberPrefix,
				next_order_number: form.data.nextOrderNumber,
				order_number_pad_width: form.data.orderNumberPadWidth,
				order_minimum_enabled: form.data.orderMinimumEnabled,
				order_minimum_amount: form.data.orderMinimumEnabled ? form.data.orderMinimumAmount : null,
				default_commission_rate: form.data.defaultCommissionRate,
				handling_fee_amount: form.data.handlingFeeAmount,
				updated_at: new Date().toISOString()
			};

			const { error } = await supabaseAdmin.from('organizations').update(update).eq('id', orgId);

			if (error) return fail(500, { form, message: error.message });

			return message(form, { success: true });
		} catch (err) {
			console.error('[organization/orders] save threw', err);
			const detail = err instanceof Error ? err.message : 'Save failed';
			return fail(500, { form, message: detail });
		}
	},

	saveTerms: async ({ request, locals }) => {
		const { organization, user, orgType, membership } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });
		if (orgType !== 'brand') return fail(403, { message: 'Brand-org only' });
		if (!membership || !['admin', 'owner'].includes(membership.role)) {
			return fail(403, { message: 'Admin or owner required' });
		}

		const form = await superValidate(request, zod4(brandTermsSchema));
		if (!form.valid) return fail(400, { form });

		const { data: selfBrand } = await supabaseAdmin
			.from('brands')
			.select('id')
			.eq('organization_id', organization.id)
			.eq('is_self_brand', true)
			.maybeSingle();
		if (!selfBrand) return fail(400, { form, message: 'No self brand found for this org.' });

		const { data: latest } = await supabaseAdmin
			.from('brand_terms')
			.select('version')
			.eq('brand_id', selfBrand.id)
			.order('version', { ascending: false })
			.limit(1)
			.maybeSingle();
		const nextVersion = (latest?.version ?? 0) + 1;

		const { error: insertErr } = await supabaseAdmin.from('brand_terms').insert({
			brand_id: selfBrand.id,
			organization_id: organization.id,
			version: nextVersion,
			title: form.data.title,
			body: form.data.body,
			is_current: true,
			created_by: user.id
		});
		if (insertErr) return fail(500, { form, message: insertErr.message });

		return message(form, { success: true });
	}
};
