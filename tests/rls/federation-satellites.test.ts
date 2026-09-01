import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import {
	expectHidden,
	expectInsertAllowed,
	expectInsertDenied,
	expectVisible
} from './setup/assert.js';
import { adminClient } from './setup/clients.js';

beforeAll(loadPersonaIds);

describe('brand_assets federation (symmetric)', () => {
	// Unlike accounts (asymmetric, explicit federated_account_links) and
	// unlike product_images/account_tags/account_tag_assignments below
	// (rep-side only), brand_assets federation is deliberately symmetric:
	// "Brand assets visible via federation" USING (organization_id IN
	// (SELECT get_connected_org_ids())) resolves connections in both
	// directions, so a connected rep sees the brand org's assets AND the
	// brand org sees the connected rep org's assets.
	let assetBrandA1Id: string;
	let assetRepAOwnId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: brandAsset, error: brandAssetErr } = await admin
			.from('brand_assets')
			.insert({
				brand_id: RLS_IDS.brandA1,
				organization_id: RLS_IDS.orgBrandA,
				name: 'RLS Brand A Asset',
				file_path: 'rls-probe/brand-a-asset.pdf'
			})
			.select('id')
			.single();
		if (brandAssetErr || !brandAsset) {
			throw new Error(`brand_assets (brand A) insert failed: ${brandAssetErr?.message}`);
		}
		assetBrandA1Id = (brandAsset as { id: string }).id;

		const { data: repAsset, error: repAssetErr } = await admin
			.from('brand_assets')
			.insert({
				brand_id: RLS_IDS.brandRepAOwn,
				organization_id: RLS_IDS.orgRepA,
				name: 'RLS Rep A Asset',
				file_path: 'rls-probe/rep-a-asset.pdf'
			})
			.select('id')
			.single();
		if (repAssetErr || !repAsset) {
			throw new Error(`brand_assets (rep A) insert failed: ${repAssetErr?.message}`);
		}
		assetRepAOwnId = (repAsset as { id: string }).id;
	});

	afterAll(async () => {
		const admin = adminClient();
		await admin.from('brand_assets').delete().in('id', [assetBrandA1Id, assetRepAOwnId]);
	});

	it('the owning brand org sees its own asset', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'brand_assets', assetBrandA1Id);
	});

	it('a connected rep sees the brand org asset', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'brand_assets', assetBrandA1Id);
	});

	it('a pending connection grants nothing', async () => {
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'brand_assets', assetBrandA1Id);
	});

	it('an unconnected brand org sees nothing', async () => {
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'brand_assets', assetBrandA1Id);
	});

	it('the brand org also sees the connected rep org asset (symmetric direction)', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'brand_assets', assetRepAOwnId);
	});
});

describe('product_images federation (rep-side only)', () => {
	// The rep-federation SELECT policy keys on org_connections.rep_org_id, so
	// only the rep side of an active connection gains visibility. The brand
	// org does NOT see a connected rep org's product images through this
	// policy -- unlike brand_assets above.
	let repOwnProductId: string;
	let imageBrandA1Id: string;
	let imageRepAOwnId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: repProduct, error: repProductErr } = await admin
			.from('products')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				brand_id: RLS_IDS.brandRepAOwn,
				name: 'RLS Rep A In-House Product',
				style_number: 'RLS-REPA1',
				is_active: true
			})
			.select('id')
			.single();
		if (repProductErr || !repProduct) {
			throw new Error(`products (rep A own) insert failed: ${repProductErr?.message}`);
		}
		repOwnProductId = (repProduct as { id: string }).id;

		const { data: brandImage, error: brandImageErr } = await admin
			.from('product_images')
			.insert({
				product_id: RLS_IDS.productA1,
				file_path: 'rls-probe/brand-a-image.jpg'
			})
			.select('id')
			.single();
		if (brandImageErr || !brandImage) {
			throw new Error(`product_images (brand A) insert failed: ${brandImageErr?.message}`);
		}
		imageBrandA1Id = (brandImage as { id: string }).id;

		const { data: repImage, error: repImageErr } = await admin
			.from('product_images')
			.insert({
				product_id: repOwnProductId,
				file_path: 'rls-probe/rep-a-image.jpg'
			})
			.select('id')
			.single();
		if (repImageErr || !repImage) {
			throw new Error(`product_images (rep A own) insert failed: ${repImageErr?.message}`);
		}
		imageRepAOwnId = (repImage as { id: string }).id;
	});

	afterAll(async () => {
		const admin = adminClient();
		await admin.from('product_images').delete().in('id', [imageBrandA1Id, imageRepAOwnId]);
		await admin.from('products').delete().eq('id', repOwnProductId);
	});

	it('the owning brand org sees its own product image', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'product_images', imageBrandA1Id);
	});

	it('a connected rep sees the connected brand product image', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'product_images', imageBrandA1Id);
	});

	it('a pending connection grants nothing', async () => {
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'product_images', imageBrandA1Id);
	});

	it('an unconnected brand org sees nothing', async () => {
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'product_images', imageBrandA1Id);
	});

	it('the brand org does NOT see the rep org product image (rep-side only)', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectHidden(brandA, 'product_images', imageRepAOwnId);
	});

	// Positive control for the assertion above: the rep org itself sees its
	// own image via the own-org policy, proving the hidden result is the
	// rep-side-only asymmetry and not some unrelated reason the row is
	// invisible to everyone.
	it('the rep org sees its own product image', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'product_images', imageRepAOwnId);
	});
});

describe('account_tags federation (rep-side only) and write gates', () => {
	let tagBrandAId: string;
	let tagRepAOwnId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: brandTag, error: brandTagErr } = await admin
			.from('account_tags')
			.insert({ organization_id: RLS_IDS.orgBrandA, name: 'RLS Tag Brand A' })
			.select('id')
			.single();
		if (brandTagErr || !brandTag) {
			throw new Error(`account_tags (brand A) insert failed: ${brandTagErr?.message}`);
		}
		tagBrandAId = (brandTag as { id: string }).id;

		const { data: repTag, error: repTagErr } = await admin
			.from('account_tags')
			.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Tag Rep A' })
			.select('id')
			.single();
		if (repTagErr || !repTag) {
			throw new Error(`account_tags (rep A) insert failed: ${repTagErr?.message}`);
		}
		tagRepAOwnId = (repTag as { id: string }).id;
	});

	afterAll(async () => {
		const admin = adminClient();
		await admin.from('account_tags').delete().in('id', [tagBrandAId, tagRepAOwnId]);
	});

	it('the owning brand org sees its own account tag', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'account_tags', tagBrandAId);
	});

	it('a connected rep sees the connected brand account tag', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'account_tags', tagBrandAId);
	});

	it('a pending connection grants nothing', async () => {
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'account_tags', tagBrandAId);
	});

	it('an unconnected brand org sees nothing', async () => {
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'account_tags', tagBrandAId);
	});

	it('the brand org does NOT see the rep org account tag (rep-side only)', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectHidden(brandA, 'account_tags', tagRepAOwnId);
	});

	// Positive control: the rep org sees its own tag via the own-org policy.
	it('the rep org sees its own account tag', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'account_tags', tagRepAOwnId);
	});

	describe('write gate: creating a tag is admin/owner only', () => {
		it('an admin can insert an account tag', async () => {
			const brandA = await personaClient('brandAAdmin');
			const id = await expectInsertAllowed(brandA, 'account_tags', {
				organization_id: RLS_IDS.orgBrandA,
				name: 'RLS Tag Write Gate Admin'
			});
			await adminClient().from('account_tags').delete().eq('id', id);
		});

		it('a sales role cannot insert an account tag', async () => {
			const brandASales = await personaClient('brandASales');
			await expectInsertDenied(brandASales, 'account_tags', {
				organization_id: RLS_IDS.orgBrandA,
				name: 'RLS Tag Write Gate Sales'
			});
		});

		it('a guest cannot insert an account tag', async () => {
			const brandAGuest = await personaClient('brandAGuest');
			await expectInsertDenied(brandAGuest, 'account_tags', {
				organization_id: RLS_IDS.orgBrandA,
				name: 'RLS Tag Write Gate Guest'
			});
		});
	});
});

describe('account_tag_assignments federation (rep-side only) and write gates', () => {
	let tagForAssignBrandAId: string;
	let tagForAssignRepAId: string;
	let assignmentBrandAId: string;
	let assignmentRepAOwnId: string;

	beforeAll(async () => {
		const admin = adminClient();

		const { data: brandTag, error: brandTagErr } = await admin
			.from('account_tags')
			.insert({ organization_id: RLS_IDS.orgBrandA, name: 'RLS Tag For Assignment Brand A' })
			.select('id')
			.single();
		if (brandTagErr || !brandTag) {
			throw new Error(`account_tags (assign, brand A) insert failed: ${brandTagErr?.message}`);
		}
		tagForAssignBrandAId = (brandTag as { id: string }).id;

		const { data: repTag, error: repTagErr } = await admin
			.from('account_tags')
			.insert({ organization_id: RLS_IDS.orgRepA, name: 'RLS Tag For Assignment Rep A' })
			.select('id')
			.single();
		if (repTagErr || !repTag) {
			throw new Error(`account_tags (assign, rep A) insert failed: ${repTagErr?.message}`);
		}
		tagForAssignRepAId = (repTag as { id: string }).id;

		const { data: brandAssignment, error: brandAssignmentErr } = await admin
			.from('account_tag_assignments')
			.insert({ account_id: RLS_IDS.accountBrandA, tag_id: tagForAssignBrandAId })
			.select('id')
			.single();
		if (brandAssignmentErr || !brandAssignment) {
			throw new Error(
				`account_tag_assignments (brand A) insert failed: ${brandAssignmentErr?.message}`
			);
		}
		assignmentBrandAId = (brandAssignment as { id: string }).id;

		const { data: repAssignment, error: repAssignmentErr } = await admin
			.from('account_tag_assignments')
			.insert({ account_id: RLS_IDS.accountRepA, tag_id: tagForAssignRepAId })
			.select('id')
			.single();
		if (repAssignmentErr || !repAssignment) {
			throw new Error(
				`account_tag_assignments (rep A) insert failed: ${repAssignmentErr?.message}`
			);
		}
		assignmentRepAOwnId = (repAssignment as { id: string }).id;
	});

	afterAll(async () => {
		const admin = adminClient();
		await admin
			.from('account_tag_assignments')
			.delete()
			.in('id', [assignmentBrandAId, assignmentRepAOwnId]);
		await admin.from('account_tags').delete().in('id', [tagForAssignBrandAId, tagForAssignRepAId]);
	});

	it('the owning brand org sees its own tag assignment', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'account_tag_assignments', assignmentBrandAId);
	});

	it('a connected rep sees the connected brand tag assignment', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'account_tag_assignments', assignmentBrandAId);
	});

	it('a pending connection grants nothing', async () => {
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'account_tag_assignments', assignmentBrandAId);
	});

	it('an unconnected brand org sees nothing', async () => {
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'account_tag_assignments', assignmentBrandAId);
	});

	it('the brand org does NOT see the rep org tag assignment (rep-side only)', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectHidden(brandA, 'account_tag_assignments', assignmentRepAOwnId);
	});

	// Positive control: the rep org sees its own assignment via the own-org
	// policy.
	it('the rep org sees its own tag assignment', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'account_tag_assignments', assignmentRepAOwnId);
	});

	describe('write gate: assigning an existing tag is any non-guest', () => {
		// Deliberate contrast with account_tags above: creating a tag is
		// admin/owner only, but assigning an already-existing tag to an
		// account is allowed for any non-guest role, including sales.
		// accountBrandA is already assigned tagForAssignBrandAId in the outer
		// beforeAll (assignmentBrandAId). Each write-gate test below creates
		// its own fresh tag so the (account_id, tag_id) pair it inserts is
		// genuinely new -- reusing an existing pair would raise a
		// unique-constraint error instead of exercising the RLS check this
		// test characterizes.
		let salesAssignmentId: string;
		let salesTestTagId: string;

		afterAll(async () => {
			const admin = adminClient();
			if (salesAssignmentId) {
				await admin.from('account_tag_assignments').delete().eq('id', salesAssignmentId);
			}
			if (salesTestTagId) {
				await admin.from('account_tags').delete().eq('id', salesTestTagId);
			}
		});

		it('a sales role CAN insert a tag assignment', async () => {
			const admin = adminClient();
			const { data: tag, error: tagErr } = await admin
				.from('account_tags')
				.insert({ organization_id: RLS_IDS.orgBrandA, name: 'RLS Tag For Sales Write Gate' })
				.select('id')
				.single();
			if (tagErr || !tag) {
				throw new Error(`account_tags (sales write gate) insert failed: ${tagErr?.message}`);
			}
			salesTestTagId = (tag as { id: string }).id;

			const brandASales = await personaClient('brandASales');
			salesAssignmentId = await expectInsertAllowed(brandASales, 'account_tag_assignments', {
				account_id: RLS_IDS.accountBrandA,
				tag_id: salesTestTagId
			});
		});

		it('a guest cannot insert a tag assignment', async () => {
			const admin = adminClient();
			const { data: guestTestTag, error: guestTestTagErr } = await admin
				.from('account_tags')
				.insert({ organization_id: RLS_IDS.orgBrandA, name: 'RLS Tag For Guest Denial' })
				.select('id')
				.single();
			if (guestTestTagErr || !guestTestTag) {
				throw new Error(`account_tags (guest denial) insert failed: ${guestTestTagErr?.message}`);
			}
			const guestTestTagId = (guestTestTag as { id: string }).id;

			try {
				const brandAGuest = await personaClient('brandAGuest');
				await expectInsertDenied(brandAGuest, 'account_tag_assignments', {
					account_id: RLS_IDS.accountBrandA,
					tag_id: guestTestTagId
				});
			} finally {
				await admin.from('account_tags').delete().eq('id', guestTestTagId);
			}
		});
	});
});
