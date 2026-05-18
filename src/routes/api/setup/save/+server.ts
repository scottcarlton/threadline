import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { setupSaveSchema, setupGatewaySchema } from '$lib/schemas/setup-save.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orgId = locals.organization.id;
	const raw = await request.json();

	// Try structured steps first, then gateway steps
	const parsed = setupSaveSchema.safeParse(raw);
	if (parsed.success) {
		return handleStructuredStep(orgId, parsed.data);
	}

	const gateway = setupGatewaySchema.safeParse(raw);
	if (gateway.success) {
		return handleGatewayStep(orgId, gateway.data);
	}

	return json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
};

async function handleStructuredStep(
	orgId: string,
	data: import('$lib/schemas/setup-save.js').SetupSaveInput
) {
	try {
		switch (data.step) {
			case 'address': {
				const v = data.value;
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						address_line1: v.line1,
						address_line2: v.line2,
						city: v.city,
						state: v.state,
						zip: v.zip,
						country: v.country,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}

			case 'ship-from': {
				if (data.value === 'yes') {
					const { error } = await supabaseAdmin
						.from('organizations')
						.update({
							shipping_use_business_address: true,
							updated_at: new Date().toISOString()
						})
						.eq('id', orgId);
					if (error) throw error;
				}
				// 'skip' is a no-op — don't set any flag
				break;
			}

			case 'shipping-default': {
				if (data.value === 'skip') break;
				// value is a UUID — exact match, no fuzzy lookup
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						default_shipping_method_id: data.value,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}

			case 'payment-methods': {
				if (data.value === 'skip') break;
				const methods = data.value;
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						accepted_payment_methods: methods,
						default_payment_method: methods[0],
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}

			case 'payment-terms': {
				if (data.value === 'skip') break;
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						default_payment_terms: data.value,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}
		}

		return json({ success: true });
	} catch (err) {
		console.error(`[setup/save] step=${data.step}`, err);
		return json({ error: 'Save failed' }, { status: 500 });
	}
}

async function handleGatewayStep(
	orgId: string,
	data: import('$lib/schemas/setup-save.js').SetupGatewayInput
) {
	try {
		const status = data.value === 'yes' ? 'completed' : 'skipped';
		const { error } = await supabaseAdmin.from('org_setup_status').upsert(
			{
				organization_id: orgId,
				section: data.step,
				status,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'organization_id,section' }
		);
		if (error) throw error;
		return json({ success: true });
	} catch (err) {
		console.error(`[setup/save] gateway step=${data.step}`, err);
		return json({ error: 'Save failed' }, { status: 500 });
	}
}
