import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { brandTermsSchema } from '$lib/schemas/brand-terms.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, orgType, membership } = locals;
	if (!organization) throw redirect(303, '/insight');
	if (orgType !== 'brand') throw redirect(303, '/insight');
	if (!membership || !['admin', 'owner'].includes(membership.role)) {
		throw redirect(303, '/organization');
	}

	const [brandsRes, currentRes, historyRes] = await Promise.all([
		supabaseAdmin
			.from('brands')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name'),
		supabaseAdmin
			.from('brand_terms')
			.select('id, brand_id, title, body, version, is_current, created_at, created_by')
			.eq('organization_id', organization.id)
			.eq('is_current', true),
		supabaseAdmin
			.from('brand_terms')
			.select('id, brand_id, version, title, created_at, is_current')
			.eq('organization_id', organization.id)
			.order('brand_id')
			.order('version', { ascending: false })
	]);

	const form = await superValidate(zod4(brandTermsSchema));

	return {
		brands: brandsRes.data ?? [],
		current: currentRes.data ?? [],
		history: historyRes.data ?? [],
		form
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const { organization, user, orgType, membership } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });
		if (orgType !== 'brand') return fail(403, { message: 'Brand-org only' });
		if (!membership || !['admin', 'owner'].includes(membership.role)) {
			return fail(403, { message: 'Admin or owner required' });
		}

		const form = await superValidate(request, zod4(brandTermsSchema));
		if (!form.valid) return fail(400, { form });

		// Verify the brand belongs to this org.
		const { data: brandRow } = await supabaseAdmin
			.from('brands')
			.select('id')
			.eq('id', form.data.brand_id)
			.eq('organization_id', organization.id)
			.maybeSingle();
		if (!brandRow) return fail(400, { form, message: 'Unknown brand for this organization.' });

		// Determine next version number based on existing rows.
		const { data: latest } = await supabaseAdmin
			.from('brand_terms')
			.select('version')
			.eq('brand_id', form.data.brand_id)
			.order('version', { ascending: false })
			.limit(1)
			.maybeSingle();
		const nextVersion = (latest?.version ?? 0) + 1;

		const { error: insertErr } = await supabaseAdmin.from('brand_terms').insert({
			brand_id: form.data.brand_id,
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
