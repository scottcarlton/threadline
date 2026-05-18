import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { setupSaveSchema, setupGatewaySchema } from '$lib/schemas/setup-save.js';
import { sendEmail } from '$lib/server/email.js';
import { inviteParams, sendInviteEmailFromOrg } from '$lib/server/email-templates.js';
import { getOrCreateConnectInvite } from '$lib/server/connections.js';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.session || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orgId = locals.organization.id;
	const raw = await request.json();

	const parsed = setupSaveSchema.safeParse(raw);
	if (parsed.success) {
		return handleStructuredStep(orgId, parsed.data, locals, url);
	}

	const gateway = setupGatewaySchema.safeParse(raw);
	if (gateway.success) {
		return handleGatewayStep(orgId, gateway.data);
	}

	return json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
};

async function handleStructuredStep(
	orgId: string,
	data: import('$lib/schemas/setup-save.js').SetupSaveInput,
	locals: App.Locals,
	url: URL
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

			case 'product-manual': {
				const v = data.value;

				// Look up brand for this org
				const { data: brand, error: brandErr } = await supabaseAdmin
					.from('brands')
					.select('id')
					.eq('organization_id', orgId)
					.eq('is_active', true)
					.limit(1)
					.single();
				if (brandErr || !brand) {
					return json({ error: 'No active brand found for this organization' }, { status: 400 });
				}

				// Insert product
				const { data: product, error: prodErr } = await supabaseAdmin
					.from('products')
					.insert({
						organization_id: orgId,
						brand_id: brand.id,
						style_number: v.styleNumber,
						name: v.name,
						wholesale_price: v.wholesalePrice,
						retail_price: v.retailPrice ?? null,
						category: v.category || null,
						is_active: true
					})
					.select('id')
					.single();
				if (prodErr || !product) throw prodErr ?? new Error('Product insert failed');

				// Create variants from size × color matrix
				const sizes = v.sizes.length > 0 ? v.sizes : [null];
				const colors = v.colors.length > 0 ? v.colors : [null];
				const variants = sizes.flatMap((size) =>
					colors.map((color) => ({
						product_id: product.id,
						size,
						color,
						is_active: true
					}))
				);
				const { error: varErr } = await supabaseAdmin.from('product_variants').insert(variants);
				if (varErr) throw varErr;

				return json({ success: true, productId: product.id });
			}

			case 'account-manual': {
				const v = data.value;
				const { error: accErr } = await supabaseAdmin.from('accounts').insert({
					organization_id: orgId,
					business_name: v.businessName,
					contact_name: v.contactName || null,
					contact_email: v.contactEmail || null,
					phone: v.contactPhone || null,
					address_line1: v.addressLine1 || null,
					address_line2: v.addressLine2 || null,
					city: v.city || null,
					state: v.state || null,
					zip: v.zip || null,
					is_active: true
				});
				if (accErr) throw accErr;
				break;
			}

			case 'member-invite': {
				const v = data.value;
				const userId = locals.session!.user.id;
				const membershipId = locals.membership?.id;

				const { data: invite, error: invErr } = await supabaseAdmin
					.from('invitations')
					.insert({
						organization_id: orgId,
						email: v.email,
						role: v.role,
						commission_rate: v.role === 'sales' ? v.commissionRate : 0,
						invited_by: userId
					})
					.select('id, token')
					.single();
				if (invErr) throw invErr;

				// Send invite email (best-effort)
				try {
					const inviterName = locals.user?.display_name ?? 'A teammate';
					const acceptUrl = `${url.origin}/invite/${invite.token}`;
					await sendEmail({
						to: v.email,
						subject: `${inviterName} invited you to ${locals.organization!.name} on Threadline`,
						html: '',
						template: 'invite',
						params: inviteParams({
							inviterName,
							organizationName: locals.organization!.name,
							acceptUrl,
							role: v.role
						})
					});
				} catch (emailErr) {
					console.error('[setup/save] invite email failed:', emailErr);
				}

				break;
			}

			case 'partner-invite': {
				const v = data.value;
				const userId = locals.session!.user.id;

				const invite = await getOrCreateConnectInvite(supabaseAdmin, orgId, userId);
				const inviteUrl = `${url.origin}/connect/${invite.code}`;

				try {
					await sendInviteEmailFromOrg({
						to: v.email,
						from_org_name: locals.organization!.name,
						from_user_name: locals.user?.display_name ?? null,
						invite_url: inviteUrl,
						organizationId: orgId,
						profileId: userId
					});
				} catch (emailErr) {
					console.error('[setup/save] partner invite email failed:', emailErr);
				}

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
