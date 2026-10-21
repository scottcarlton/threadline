import type { CreateAccountInput } from '$lib/schemas/account';

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
