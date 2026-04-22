import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { brandTermsSchema } from '$lib/schemas/brand-terms.js';

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
	const { organization, orgType, supabase, membership } = locals;

	let selfBrand: {
		id: string;
		website: string | null;
		contact_email: string | null;
		contact_phone: string | null;
	} | null = null;

	if (orgType === 'brand' && organization) {
		const { data } = await supabase
			.from('brands')
			.select('id, website, contact_email, contact_phone')
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

	return {
		org: organization
			? {
					id: organization.id,
					name: organization.name,
					logo_url: organization.logo_url,
					address_line1: organization.address_line1,
					address_line2: organization.address_line2,
					city: organization.city,
					state: organization.state,
					zip: organization.zip,
					default_commission_rate:
						(organization as { default_commission_rate?: number }).default_commission_rate ?? 10,
					accepted_payment_methods: organization.accepted_payment_methods ?? [],
					default_payment_method: organization.default_payment_method ?? null
				}
			: null,
		orgType,
		selfBrand,
		canEditTerms,
		currentTerms,
		termsHistory,
		termsForm
	};
};

export const actions: Actions = {
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

		return { form, success: true };
	}
};
