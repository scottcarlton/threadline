import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orgId = locals.organization.id;
	const { step, value } = await request.json();

	try {
		switch (step) {
			case 'address': {
				const parts = parseAddress(value as string);
				await supabaseAdmin
					.from('organizations')
					.update({
						address_line1: parts.line1,
						city: parts.city,
						state: parts.state,
						zip: parts.zip,
						country: parts.country ?? 'US',
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				break;
			}

			case 'ship-from': {
				if (value === 'skip' || value === 'yes') {
					await supabaseAdmin
						.from('organizations')
						.update({
							shipping_use_business_address: true,
							updated_at: new Date().toISOString()
						})
						.eq('id', orgId);
				}
				break;
			}

			case 'shipping-default': {
				if (value === 'skip') break;
				const { data: method } = await supabaseAdmin
					.from('organization_shipping_methods')
					.select('id')
					.eq('organization_id', orgId)
					.ilike('name', `%${value}%`)
					.limit(1)
					.maybeSingle();

				if (method) {
					await supabaseAdmin
						.from('organizations')
						.update({
							default_shipping_method_id: method.id,
							updated_at: new Date().toISOString()
						})
						.eq('id', orgId);
				}
				break;
			}

			case 'payment-methods': {
				if (value === 'skip') break;
				const methods = Array.isArray(value) ? value : [value];
				await supabaseAdmin
					.from('organizations')
					.update({
						accepted_payment_methods: methods,
						default_payment_method: methods[0],
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				break;
			}

			case 'payment-terms': {
				if (value === 'skip') break;
				await supabaseAdmin
					.from('organizations')
					.update({
						default_payment_terms: value,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				break;
			}

			case 'orders':
			case 'taxes':
			case 'returns': {
				if (value === 'skip' || value === 'later') {
					await supabaseAdmin.from('org_setup_status').upsert(
						{
							organization_id: orgId,
							section: step,
							status: 'skipped',
							updated_at: new Date().toISOString()
						},
						{ onConflict: 'organization_id,section' }
					);
				}
				break;
			}

			default:
				return json({ error: `Unknown step: ${step}` }, { status: 400 });
		}

		return json({ success: true });
	} catch (err) {
		console.error(`[setup/save] step=${step}`, err);
		return json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 });
	}
};

function parseAddress(raw: string): {
	line1: string;
	city: string;
	state: string;
	zip: string;
	country?: string;
} {
	const parts = raw.split(',').map((s) => s.trim());
	if (parts.length >= 3) {
		const stateZip = parts[parts.length - 1].split(/\s+/);
		const state = stateZip[0] ?? '';
		const zip = stateZip.slice(1).join(' ') || '';
		const city = parts[parts.length - 2] ?? '';
		const line1 = parts.slice(0, parts.length - 2).join(', ');
		return { line1, city, state, zip };
	}
	return { line1: raw, city: '', state: '', zip: '' };
}
