import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { organizationProfileSchema } from '$lib/schemas/organization-profile.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { organization, orgType, supabase } = locals;

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

	const profileForm = await superValidate(zod4(organizationProfileSchema));
	if (organization) {
		profileForm.data.name = organization.name ?? '';
		profileForm.data.legalBusinessName = organization.legal_business_name ?? '';
		profileForm.data.tagline = organization.tagline ?? '';
		profileForm.data.addressLine1 = organization.address_line1 ?? '';
		profileForm.data.addressLine2 = organization.address_line2 ?? '';
		profileForm.data.city = organization.city ?? '';
		profileForm.data.state = organization.state ?? '';
		profileForm.data.zip = organization.zip ?? '';
		profileForm.data.country = organization.country ?? 'US';
		profileForm.data.timeZone = organization.time_zone ?? 'America/Los_Angeles';
		profileForm.data.currencyCode = organization.currency_code ?? 'USD';
		profileForm.data.website = selfBrand?.website ?? '';
		profileForm.data.contactEmail = selfBrand?.contact_email ?? '';
		profileForm.data.contactPhone = selfBrand?.contact_phone ?? '';
	}

	return {
		org: organization
			? {
					id: organization.id,
					name: organization.name,
					logo_url: organization.logo_url,
					logo_storage_path: organization.logo_storage_path,
					accepted_payment_methods: organization.accepted_payment_methods ?? [],
					default_payment_method: organization.default_payment_method ?? null
				}
			: null,
		orgType,
		selfBrand,
		profileForm
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { organization, user, orgType, membership } = locals;
		if (!organization || !user) return fail(401, { message: 'Not authenticated' });
		if (!membership || !['admin', 'owner'].includes(membership.role)) {
			return fail(403, { message: 'Admin or owner required' });
		}

		const form = await superValidate(request, zod4(organizationProfileSchema));
		if (!form.valid) return fail(400, { form });

		const orgUpdate = {
			name: form.data.name,
			legal_business_name: form.data.legalBusinessName || null,
			tagline: form.data.tagline || null,
			address_line1: form.data.addressLine1 || null,
			address_line2: form.data.addressLine2 || null,
			city: form.data.city || null,
			state: form.data.state || null,
			zip: form.data.zip || null,
			country: form.data.country,
			time_zone: form.data.timeZone,
			currency_code: form.data.currencyCode,
			updated_at: new Date().toISOString()
		};

		const { error: orgErr } = await supabaseAdmin
			.from('organizations')
			.update(orgUpdate)
			.eq('id', organization.id);

		if (orgErr) return fail(500, { form, message: orgErr.message });

		if (orgType === 'brand') {
			const { data: selfBrand } = await supabaseAdmin
				.from('brands')
				.select('id')
				.eq('organization_id', organization.id)
				.eq('is_self_brand', true)
				.maybeSingle();

			if (selfBrand) {
				const { error: brandErr } = await supabaseAdmin
					.from('brands')
					.update({
						website: form.data.website || null,
						contact_email: form.data.contactEmail || null,
						contact_phone: form.data.contactPhone || null
					})
					.eq('id', selfBrand.id);

				if (brandErr) {
					return fail(500, { form, message: 'Org saved, but brand details failed.' });
				}
			}
		}

		return { form, success: true };
	}
};
