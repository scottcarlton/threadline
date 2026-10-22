import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateAccountInput, SyncAccountPayload } from '$lib/schemas/account';
// Relative so the RLS integration suite (plain vitest, no $lib alias) can import it.
import { isPaymentPreferenceCode } from '../../payment-methods';
import type { emitIntegrationEvent } from '$lib/server/integrations/events.js';

/**
 * Arguments for `create_account_with_locations` (SCO-204), which inserts the
 * account and every location in one transaction and treats a known id as a
 * replay. The primary location mirrors the account's address and contact.
 */
export type CreateAccountArgs = {
	p_account_id: string;
	p_org_id: string;
	p_account: Record<string, string | null>;
	p_locations: Array<Record<string, string | number | boolean | null>>;
};

const nn = (v: string | undefined | null) => (v && v.length ? v : null);

export function buildCreateAccountArgs(
	data: CreateAccountInput,
	orgId: string,
	paymentPreference: string | null,
	newId: () => string = () => crypto.randomUUID()
): CreateAccountArgs {
	const { business, contact, notes } = data;

	return {
		p_account_id: data.id ?? newId(),
		p_org_id: orgId,
		p_account: {
			business_name: business.name,
			website: nn(business.website),
			phone: nn(business.phone),
			address_line1: nn(business.address.line1),
			address_line2: nn(business.address.line2),
			city: nn(business.address.city),
			state: nn(business.address.state),
			zip: nn(business.address.zip),
			contact_first_name: contact.firstName,
			contact_last_name: contact.lastName,
			contact_email: nn(contact.email),
			contact_phone: nn(contact.phone),
			notes: nn(notes),
			payment_preference: paymentPreference
		},
		p_locations: [
			{
				id: data.primaryLocationId ?? newId(),
				label: 'Primary',
				is_default: true,
				sort_order: 0,
				address_line1: nn(business.address.line1),
				address_line2: nn(business.address.line2),
				city: nn(business.address.city),
				state: nn(business.address.state),
				zip: nn(business.address.zip),
				phone: nn(business.phone),
				contact_first_name: contact.firstName,
				contact_last_name: contact.lastName,
				contact_email: nn(contact.email)
			},
			...business.additionalLocations.map((loc, i) => ({
				id: loc.id ?? newId(),
				label: loc.label,
				is_default: false,
				sort_order: i + 1,
				address_line1: nn(loc.address.line1),
				address_line2: nn(loc.address.line2),
				city: nn(loc.address.city),
				state: nn(loc.address.state),
				zip: nn(loc.address.zip),
				phone: nn(loc.phone),
				contact_first_name: nn(loc.contact?.firstName),
				contact_last_name: nn(loc.contact?.lastName),
				contact_email: nn(loc.contact?.email)
			}))
		]
	};
}

/**
 * The org's accepted method if the rep picked one, else the org default when
 * it is itself accepted. The form still submits the merged payment-preference
 * list until the Finalize redesign splits methods from terms in the UI.
 */
export function resolvePaymentPreference(
	picked: string | undefined,
	accepted: string[],
	orgDefault: string | null
): string | null {
	const p = picked?.trim() ?? '';
	if (p && isPaymentPreferenceCode(p) && accepted.includes(p)) return p;
	return orgDefault && accepted.includes(orgDefault) ? orgDefault : null;
}

export type CreateAccountOutcome =
	| { ok: true; accountId: string; inserted: boolean; inviteFailed: boolean }
	| { ok: false; status: 403 | 409 | 500; message: string };

type Audit = App.Locals['audit'];

/**
 * Create (or replay) an account for POST /api/sync/accounts. Runs as the
 * signed-in user through `supabase` (locals.supabase), so the INSERT policies
 * decide whether this user may create accounts in `payload.organization_id`.
 * Side effects (audit, integration event, buyer invite) run only on the first
 * insert, never on a replay.
 */
export async function createAccount({
	supabase,
	audit,
	payload,
	origin,
	fetch,
	emit
}: {
	supabase: SupabaseClient;
	audit: Audit;
	payload: SyncAccountPayload;
	origin: string;
	fetch: typeof globalThis.fetch;
	emit: typeof emitIntegrationEvent;
}): Promise<CreateAccountOutcome> {
	const orgId = payload.organization_id;
	const { data: org } = await supabase
		.from('organizations')
		.select('id, accepted_payment_methods, default_payment_method')
		.eq('id', orgId)
		.maybeSingle();
	if (!org) {
		return { ok: false, status: 403, message: "You're not a member of that organization." };
	}

	const data = payload.account;
	const paymentPref = resolvePaymentPreference(
		data.paymentPreference,
		(org.accepted_payment_methods ?? []) as string[],
		(org.default_payment_method ?? null) as string | null
	);

	const args = buildCreateAccountArgs(data, orgId, paymentPref);
	const { data: created, error } = await supabase
		.rpc('create_account_with_locations', args)
		.single<{ account_id: string; inserted: boolean }>();

	if (error || !created) {
		if (error?.code === '42501') {
			return { ok: false, status: 403, message: "You don't have permission to create accounts." };
		}
		if (error?.code === '23505') {
			return { ok: false, status: 409, message: 'This account id is already in use.' };
		}
		console.error('[sync/accounts] create failed', {
			org_id: orgId,
			account_id: args.p_account_id,
			error
		});
		return { ok: false, status: 500, message: 'Could not create the account. Try again.' };
	}

	if (!created.inserted) {
		return { ok: true, accountId: created.account_id, inserted: false, inviteFailed: false };
	}

	const accountId = created.account_id;
	const { business, contact } = data;
	audit.record('account.created', {
		organizationId: orgId,
		subjectId: accountId,
		subjectLabel: business.name,
		metadata: { city: nn(business.address.city), state: nn(business.address.state) }
	});

	emit(orgId, 'new_account', {
		accountName: business.name,
		city: business.address.city || undefined,
		state: business.address.state || undefined,
		url: `${origin}/accounts/${accountId}`
	});

	let inviteFailed = false;
	if (contact.email) {
		try {
			const res = await fetch('/api/buyer-invite/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: contact.email, accountId, brandIds: [] })
			});
			if (!res.ok) {
				inviteFailed = true;
				console.error(`buyer-invite/send returned ${res.status} for account ${accountId}`);
			}
		} catch (err) {
			inviteFailed = true;
			console.error(`buyer-invite/send threw for account ${accountId}:`, err);
		}
	}

	return { ok: true, accountId, inserted: true, inviteFailed };
}
