import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import {
	organizationShippingSchema,
	shippingMethodSchema
} from '$lib/schemas/organization-shipping.js';
import type { OrganizationShippingMethod } from '$lib/types/database.js';
import { requireAdmin } from '$lib/server/auth/require-admin.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.orgType !== 'brand') throw error(404, 'Not found');
	const { organization, supabase } = locals;

	const form = await superValidate(zod4(organizationShippingSchema));
	let methods: OrganizationShippingMethod[] = [];
	let defaultMethodId: string | null = null;

	if (organization) {
		form.data.useBusinessAddress = organization.shipping_use_business_address ?? true;
		form.data.shippingFromLine1 = organization.shipping_from_line1 ?? '';
		form.data.shippingFromLine2 = organization.shipping_from_line2 ?? '';
		form.data.shippingFromCity = organization.shipping_from_city ?? '';
		form.data.shippingFromState = organization.shipping_from_state ?? '';
		form.data.shippingFromZip = organization.shipping_from_zip ?? '';
		form.data.shippingFromCountry = organization.shipping_from_country ?? '';
		form.data.freeThresholdEnabled = organization.shipping_free_threshold_enabled ?? false;
		form.data.freeThresholdAmount = Number(organization.shipping_free_threshold_amount ?? 0);
		defaultMethodId = organization.default_shipping_method_id ?? null;

		const { data } = await supabase
			.from('organization_shipping_methods')
			.select('*')
			.eq('organization_id', organization.id)
			.order('name', { ascending: true });
		methods = (data ?? []) as OrganizationShippingMethod[];
	}

	return { form, methods, defaultMethodId };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const form = await superValidate(request, zod4(organizationShippingSchema));
		if (!form.valid) return fail(400, { form });

		try {
			const update = {
				shipping_use_business_address: form.data.useBusinessAddress,
				shipping_from_line1: form.data.useBusinessAddress
					? null
					: form.data.shippingFromLine1 || null,
				shipping_from_line2: form.data.useBusinessAddress
					? null
					: form.data.shippingFromLine2 || null,
				shipping_from_city: form.data.useBusinessAddress
					? null
					: form.data.shippingFromCity || null,
				shipping_from_state: form.data.useBusinessAddress
					? null
					: form.data.shippingFromState || null,
				shipping_from_zip: form.data.useBusinessAddress ? null : form.data.shippingFromZip || null,
				shipping_from_country: form.data.useBusinessAddress
					? null
					: form.data.shippingFromCountry || null,
				shipping_free_threshold_enabled: form.data.freeThresholdEnabled,
				shipping_free_threshold_amount: form.data.freeThresholdEnabled
					? form.data.freeThresholdAmount
					: null,
				updated_at: new Date().toISOString()
			};

			const { error } = await supabaseAdmin.from('organizations').update(update).eq('id', orgId);

			if (error) return fail(500, { form, message: error.message });
			return message(form, { success: true });
		} catch (err) {
			console.error('[organization/shipping] save threw', err);
			const detail = err instanceof Error ? err.message : 'Save failed';
			return fail(500, { form, message: detail });
		}
	},

	upsertMethod: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const form = await superValidate(request, zod4(shippingMethodSchema));
		if (!form.valid) return fail(400, { form });

		const payload = {
			organization_id: orgId,
			name: form.data.name,
			cost_type: form.data.costType,
			cost_amount: form.data.costAmount === '' ? null : form.data.costAmount,
			delivery_window: form.data.deliveryWindow || null,
			updated_at: new Date().toISOString()
		};

		if (form.data.id) {
			// On rename, propagate the new name to the legacy text column for any
			// org/account that has this method as their default — keeps /orders/new
			// in sync until the order readers migrate.
			const { data: prev } = await supabaseAdmin
				.from('organization_shipping_methods')
				.select('name')
				.eq('id', form.data.id)
				.eq('organization_id', orgId)
				.maybeSingle();

			const { error } = await supabaseAdmin
				.from('organization_shipping_methods')
				.update(payload)
				.eq('id', form.data.id)
				.eq('organization_id', orgId);
			if (error) return fail(500, { form, message: error.message });

			if (prev && prev.name !== form.data.name) {
				await supabaseAdmin
					.from('organizations')
					.update({ default_shipping_method: form.data.name })
					.eq('default_shipping_method_id', form.data.id);
				// accounts.shipping_method_id was dropped in 20260426000001.
				// The free-text accounts.shipping_method column is now the
				// override surface; renaming the org method no longer cascades
				// (account-level text becomes a manual override at that point).
			}
		} else {
			const { error } = await supabaseAdmin.from('organization_shipping_methods').insert(payload);
			if (error) return fail(500, { form, message: error.message });
		}

		return message(form, { success: true });
	},

	deleteMethod: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const formData = await request.formData();
		const id = formData.get('id');
		if (typeof id !== 'string' || !id) return fail(400, { message: 'Missing id' });

		// Block deletion when the method is the org's current default.
		// accounts.shipping_method_id was dropped in 20260426000001 — only
		// the org-level FK is left to check.
		const { count: orgDefaultCount } = await supabaseAdmin
			.from('organizations')
			.select('id', { count: 'exact', head: true })
			.eq('default_shipping_method_id', id);
		if ((orgDefaultCount ?? 0) > 0) {
			return fail(400, {
				message: 'This method is in use as a default. Change defaults before removing.'
			});
		}

		const { error } = await supabaseAdmin
			.from('organization_shipping_methods')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (error) return fail(500, { message: error.message });
		return { success: true };
	},

	makeDefault: async ({ request, locals }) => {
		const denied = requireAdmin(locals);
		if (denied) return fail(denied.status, { message: denied.error });
		const orgId = locals.organization!.id;

		const formData = await request.formData();
		const id = formData.get('id');
		if (typeof id !== 'string' || !id) return fail(400, { message: 'Missing id' });

		const { data: method } = await supabaseAdmin
			.from('organization_shipping_methods')
			.select('id, name')
			.eq('id', id)
			.eq('organization_id', orgId)
			.single();

		if (!method) return fail(404, { message: 'Method not found' });

		// Dual-write: FK + legacy text column kept in sync until the order
		// readers migrate to the FK in a follow-up PR.
		const { error } = await supabaseAdmin
			.from('organizations')
			.update({
				default_shipping_method_id: method.id,
				default_shipping_method: method.name,
				updated_at: new Date().toISOString()
			})
			.eq('id', orgId);

		if (error) return fail(500, { message: error.message });
		return { success: true };
	}
};
