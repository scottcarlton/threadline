import { beforeAll, describe, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectDeleteAllowed,
	expectDeleteDenied,
	expectHidden,
	expectInsertDenied,
	expectUpdateAllowed,
	expectUpdateDenied,
	expectVisible
} from './setup/assert.js';

/**
 * RLS for `return_authorizations` and `return_lines` (SCO-182).
 *
 * Three actors read a return and each keys off a different column, so the cases
 * below are grouped by reader rather than by table:
 *
 *   brand  -> brand_id IN get_user_brand_ids(organization_id)
 *   rep    -> order_org_id IN get_user_org_ids()
 *             AND order_org_id <> organization_id
 *   buyer  -> account_id IN get_buyer_account_ids()
 *
 * Two differences from `invoices` are deliberate and are pinned here.
 *
 * First, there is no `status <> 'draft'` gate on the federated arms. An invoice
 * hides its draft because a draft is the brand's private working document. A
 * return at `requested` is the opposite: it is a request addressed to the
 * brand, and the rep servicing the account is exactly who needs to see it while
 * it is pending.
 *
 * Second, `order_id` is nullable, so a return can exist with no order at all.
 * `returnFreeEntryRepA` covers that case, which `invoices` never has to model.
 *
 * The `order_org_id <> organization_id` clause on the rep arm is carried over
 * unchanged and is not decoration. Policies are OR'd, so without it that arm
 * fires for a brand-internal return and hands every member of the brand org a
 * row the brand-scoped arm withheld. The "member scoped to one brand" case
 * below is what proves it.
 *
 * The whole ownership rule for this feature -- only the brand may approve,
 * receive, and credit -- is enforced by there being no rep or buyer UPDATE
 * policy at all. Approve, decline, receive and issue are all UPDATEs, so the
 * "cannot update" cases below are load-bearing, not incidental.
 */
describe('returns RLS', () => {
	beforeAll(async () => {
		await loadPersonaIds();
	});

	describe('brand org (the issuer)', () => {
		it('admin sees returns for every brand in the org', async () => {
			const client = await personaClient('brandAAdmin');
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2);
		});

		it('admin sees a free-entry return with no order', async () => {
			const client = await personaClient('brandAAdmin');
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnFreeEntryRepA);
		});

		it("member scoped to one brand cannot see another brand's return", async () => {
			// brandAMember has a member_brand_access row for A1 only, so the A2
			// return must be invisible even though it is in their own org.
			//
			// This is the case that proves `order_org_id <> organization_id` on the
			// rep arm. returnApprovedBrandA2 is brand-internal, so its order_org_id
			// IS orgBrandA, which is in brandAMember's get_user_org_ids(). Drop the
			// guard and the rep arm hands them this row.
			const client = await personaClient('brandAMember');
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2);
		});

		it('a different brand org sees nothing', async () => {
			const client = await personaClient('brandBAdmin');
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2);
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnFreeEntryRepA);
		});

		it('admin can approve a requested return', async () => {
			const client = await personaClient('brandAAdmin');
			await expectUpdateAllowed(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				status: 'approved'
			});
			// Put it back so later cases still see a `requested` row.
			await expectUpdateAllowed(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				status: 'requested'
			});
		});

		it('member scoped to one brand cannot update another brand', async () => {
			const client = await personaClient('brandAMember');
			await expectUpdateDenied(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2, {
				status: 'received'
			});
		});
	});

	describe('rep org (the order owner)', () => {
		it('sees a return on an order in its org, including one still requested', async () => {
			// The invoices suite asserts the opposite for drafts. Here a pending
			// request MUST be visible: it is addressed to the brand, and the rep
			// services the account it came from.
			const client = await personaClient('repAAdmin');
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
		});

		it('sees a free-entry return attributed to its org', async () => {
			// No order_id, no account_id. order_org_id alone carries this row.
			const client = await personaClient('repAAdmin');
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnFreeEntryRepA);
		});

		it('cannot see a brand-internal return', async () => {
			const client = await personaClient('repAAdmin');
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2);
		});

		it('an unrelated rep org sees nothing', async () => {
			const client = await personaClient('repBAdmin');
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnFreeEntryRepA);
		});

		it('cannot approve, receive, or credit a return it can read', async () => {
			// There is no rep UPDATE policy, which is the whole of locked decision
			// 5: reps request, brands approve. Each of these is a real transition
			// the feature performs, so all three are checked rather than one.
			const client = await personaClient('repAAdmin');
			await expectUpdateDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				status: 'approved'
			});
			await expectUpdateDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				status: 'received'
			});
			await expectUpdateDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				credit_memo_number: 'CM-FORGED-00001'
			});
		});

		it('cannot delete a return it can read', async () => {
			const client = await personaClient('repAAdmin');
			await expectDeleteDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
		});

		it('cannot create a return already approved', async () => {
			// The rep INSERT arm pins status to 'requested'. Without that pin a rep
			// could self-approve at creation and skip the brand entirely.
			const client = await personaClient('repAAdmin');
			await expectInsertDenied(client, 'return_authorizations', {
				organization_id: RLS_IDS.orgBrandA,
				brand_id: RLS_IDS.brandA1,
				order_org_id: RLS_IDS.orgRepA,
				status: 'approved'
			});
		});
	});

	describe('buyer', () => {
		it('sees returns for their own account, including pending ones', async () => {
			const client = await personaClient('buyer');
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
			await expectVisible(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2);
		});

		it('cannot see a return with no account on it', async () => {
			// returnFreeEntryRepA has account_id NULL, so the buyer arm cannot match.
			const client = await personaClient('buyer');
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnFreeEntryRepA);
		});

		it('cannot approve or credit', async () => {
			const client = await personaClient('buyer');
			await expectUpdateDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				status: 'approved'
			});
			await expectUpdateDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA, {
				credit_total: 9999
			});
		});

		it('cannot delete', async () => {
			const client = await personaClient('buyer');
			await expectDeleteDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
		});

		it('cannot create a return already approved', async () => {
			const client = await personaClient('buyer');
			await expectInsertDenied(client, 'return_authorizations', {
				organization_id: RLS_IDS.orgBrandA,
				brand_id: RLS_IDS.brandA1,
				account_id: RLS_IDS.accountBrandA,
				status: 'approved'
			});
		});

		it('cannot request a return against an account that is not theirs', async () => {
			const client = await personaClient('buyer');
			await expectInsertDenied(client, 'return_authorizations', {
				organization_id: RLS_IDS.orgBrandB,
				brand_id: RLS_IDS.brandB1,
				account_id: RLS_IDS.accountBrandB,
				status: 'requested'
			});
		});
	});

	describe('return_lines', () => {
		it('follow the parent return visibility', async () => {
			const brand = await personaClient('brandAAdmin');
			const rep = await personaClient('repAAdmin');
			const buyer = await personaClient('buyer');
			await expectVisible(brand, 'return_lines', RLS_IDS.returnLineRequestedRepA);
			await expectVisible(rep, 'return_lines', RLS_IDS.returnLineRequestedRepA);
			await expectVisible(buyer, 'return_lines', RLS_IDS.returnLineRequestedRepA);
		});

		it('are hidden from an org that cannot see the parent', async () => {
			const client = await personaClient('brandBAdmin');
			await expectHidden(client, 'return_lines', RLS_IDS.returnLineRequestedRepA);
		});

		it('cannot be edited by the rep or the buyer', async () => {
			const rep = await personaClient('repAAdmin');
			const buyer = await personaClient('buyer');
			await expectUpdateDenied(rep, 'return_lines', RLS_IDS.returnLineRequestedRepA, { qty: 99 });
			await expectUpdateDenied(buyer, 'return_lines', RLS_IDS.returnLineRequestedRepA, { qty: 99 });
		});

		it('can be edited by the brand while the return is open', async () => {
			const client = await personaClient('brandAAdmin');
			await expectUpdateAllowed(client, 'return_lines', RLS_IDS.returnLineRequestedRepA, {
				qty: 2
			});
		});
	});

	describe('delete scope', () => {
		it('admin can delete a requested return', async () => {
			// Seeded as a throwaway rather than consuming a fixture row, matching
			// the probe pattern in invoices.test.ts: the fixture is shared across
			// the file and later cases still need returnFreeEntryRepA.
			const probeId = '0f500000-0000-4000-8000-0000000019f1';
			const { error: seedError } = await adminClient().from('return_authorizations').insert({
				id: probeId,
				organization_id: RLS_IDS.orgBrandA,
				brand_id: RLS_IDS.brandA1,
				order_org_id: RLS_IDS.orgRepA,
				status: 'requested'
			});
			if (seedError) throw new Error(`probe seed failed: ${seedError.message}`);

			const client = await personaClient('brandAAdmin');
			await expectDeleteAllowed(client, 'return_authorizations', probeId);
		});

		it('admin cannot delete an approved return', async () => {
			const client = await personaClient('brandAAdmin');
			await expectDeleteDenied(client, 'return_authorizations', RLS_IDS.returnApprovedBrandA2);
		});

		it('member cannot delete even a requested return', async () => {
			// DELETE is admin/owner, one step tighter than the UPDATE role set.
			const client = await personaClient('brandAMember');
			await expectDeleteDenied(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
		});
	});

	describe('anon', () => {
		it('sees nothing', async () => {
			const client = anonClient();
			await expectHidden(client, 'return_authorizations', RLS_IDS.returnRequestedRepA);
			await expectHidden(client, 'return_lines', RLS_IDS.returnLineRequestedRepA);
		});
	});
});
