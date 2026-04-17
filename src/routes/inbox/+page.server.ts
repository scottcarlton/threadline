import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { supabase, user, brandScope } = locals;

	// Brand-scoped members/guests cannot access inbox
	if (brandScope && brandScope.length > 0) {
		throw redirect(303, '/insight');
	}

	if (!user) {
		return { connected: false, emailAddress: null };
	}

	const { data: connection } = await supabase
		.from('email_connections')
		.select('email_address')
		.eq('profile_id', user.id)
		.maybeSingle();

	// Load account email map for auto-linking + manual links
	const orgId = locals.organization?.id;
	let accountEmailMap: { email: string; accountId: string; accountName: string }[] = [];
	let accounts: { id: string; business_name: string }[] = [];
	const emailLinks: Record<string, { entity_type: string; entity_id: string }> = {};
	if (orgId) {
		const [accountsRes, linksRes] = await Promise.all([
			supabase
				.from('accounts')
				.select('id, business_name, contact_email')
				.eq('organization_id', orgId)
				.eq('is_active', true)
				.order('business_name'),
			supabase
				.from('email_links')
				.select('gmail_message_id, entity_type, entity_id')
				.eq('organization_id', orgId)
		]);
		const allAccounts = accountsRes.data ?? [];
		accounts = allAccounts.map((a) => ({ id: a.id, business_name: a.business_name }));
		accountEmailMap = allAccounts
			.filter((a) => a.contact_email)
			.map((a) => ({
				email: a.contact_email!.toLowerCase(),
				accountId: a.id,
				accountName: a.business_name
			}));
		for (const link of linksRes.data ?? []) {
			emailLinks[link.gmail_message_id] = {
				entity_type: link.entity_type,
				entity_id: link.entity_id
			};
		}
	}

	return {
		connected: !!connection,
		emailAddress: connection?.email_address ?? null,
		accountEmailMap,
		accounts,
		emailLinks
	};
};
