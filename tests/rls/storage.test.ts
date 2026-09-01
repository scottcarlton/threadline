import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';

beforeAll(loadPersonaIds);

/**
 * supabase/migrations/20260901000020_scope_storage_bucket_policies.sql
 * replaced the six unscoped storage.objects policies (bucket_id = '...',
 * no auth/org predicate, applying to PUBLIC) with policies restricted
 * TO authenticated, plus real scoping:
 *
 *   SELECT delegates to the owning table (brand_assets / product_images /
 *   expense_receipts), so this suite proves the delegation actually works
 *   -- including that it inherits brand_assets' federation policy -- not
 *   just that anon is blocked.
 *
 *   INSERT/DELETE are scoped by the org id in the object path's first
 *   segment, matching the `${orgId}/...` convention every upload endpoint
 *   already writes (src/routes/api/brands/[id]/assets,
 *   src/routes/api/expenses/[id]/receipts, src/routes/api/upload/receipt,
 *   src/lib/server/products/upload-image.ts).
 *
 * Real objects are uploaded with the service-role client (mirroring how
 * the app writes: every upload endpoint uses supabaseAdmin, which bypasses
 * RLS) and removed in a `finally` via the storage API, per
 * storage.objects' protect_delete trigger which blocks a plain table
 * DELETE.
 */

const BRAND_ASSET_PATH = `${RLS_IDS.orgBrandA}/${RLS_IDS.brandA1}/rls-storage-probe-asset.txt`;
const RECEIPT_PATH = `${RLS_IDS.orgBrandA}/rls-storage-probe/rls-storage-probe-receipt.txt`;

let brandAssetRowId: string;
let brandExpenseId: string;
let receiptRowId: string;

async function uploadObject(bucket: string, path: string): Promise<void> {
	const { error } = await adminClient()
		.storage.from(bucket)
		.upload(path, new Blob(['probe']), { upsert: true });
	if (error) throw new Error(`storage probe upload to ${bucket}/${path} failed: ${error.message}`);
}

async function removeObject(bucket: string, path: string): Promise<void> {
	await adminClient().storage.from(bucket).remove([path]);
}

beforeAll(async () => {
	const admin = adminClient();

	// Real objects, owned by RLS Brand A, so the SELECT policies' EXISTS
	// delegation to brand_assets / expense_receipts has something to match
	// against. Uploaded via the service-role client, same as every real
	// upload endpoint.
	await uploadObject('brand-assets', BRAND_ASSET_PATH);
	await uploadObject('expense-receipts', RECEIPT_PATH);

	const { data: brandAsset, error: brandAssetErr } = await admin
		.from('brand_assets')
		.insert({
			brand_id: RLS_IDS.brandA1,
			organization_id: RLS_IDS.orgBrandA,
			name: 'RLS storage probe asset',
			file_path: BRAND_ASSET_PATH
		})
		.select('id')
		.single();
	if (brandAssetErr || !brandAsset) {
		throw new Error(`brand_assets insert failed: ${brandAssetErr?.message}`);
	}
	brandAssetRowId = (brandAsset as { id: string }).id;

	const { data: expense, error: expenseErr } = await admin
		.from('brand_expenses')
		.insert({
			organization_id: RLS_IDS.orgBrandA,
			brand_id: RLS_IDS.brandA1,
			description: 'RLS storage probe expense',
			amount: 1,
			submitted_by: PERSONA_IDS.brandAAdmin!
		})
		.select('id')
		.single();
	if (expenseErr || !expense) {
		throw new Error(`brand_expenses insert failed: ${expenseErr?.message}`);
	}
	brandExpenseId = (expense as { id: string }).id;

	const { data: receipt, error: receiptErr } = await admin
		.from('expense_receipts')
		.insert({
			expense_id: brandExpenseId,
			organization_id: RLS_IDS.orgBrandA,
			name: 'RLS storage probe receipt',
			file_path: RECEIPT_PATH
		})
		.select('id')
		.single();
	if (receiptErr || !receipt) {
		throw new Error(`expense_receipts insert failed: ${receiptErr?.message}`);
	}
	receiptRowId = (receipt as { id: string }).id;
});

afterAll(async () => {
	const admin = adminClient();
	try {
		await admin.from('expense_receipts').delete().eq('id', receiptRowId);
		await admin.from('brand_expenses').delete().eq('id', brandExpenseId);
		await admin.from('brand_assets').delete().eq('id', brandAssetRowId);
	} finally {
		await removeObject('brand-assets', BRAND_ASSET_PATH);
		await removeObject('expense-receipts', RECEIPT_PATH);
	}
});

describe('storage bucket policies', () => {
	it('anon cannot read a brand-assets object', async () => {
		const { error, data } = await anonClient()
			.storage.from('brand-assets')
			.download(BRAND_ASSET_PATH);
		expect(error, 'anon must not download brand assets').not.toBeNull();
		expect(data).toBeNull();
	});

	it('anon cannot read an expense-receipts object', async () => {
		const { error, data } = await anonClient()
			.storage.from('expense-receipts')
			.download(RECEIPT_PATH);
		expect(error, 'anon must not download expense receipts').not.toBeNull();
		expect(data).toBeNull();
	});

	it('an org member can read their own org brand-assets object', async () => {
		const brandA = await personaClient('brandAAdmin');
		const { error, data } = await brandA.storage.from('brand-assets').download(BRAND_ASSET_PATH);
		expect(error, `expected download to succeed, got ${error?.message}`).toBeNull();
		expect(data).not.toBeNull();
	});

	it('an org member can read their own org expense-receipts object', async () => {
		const brandA = await personaClient('brandAAdmin');
		const { error, data } = await brandA.storage.from('expense-receipts').download(RECEIPT_PATH);
		expect(error, `expected download to succeed, got ${error?.message}`).toBeNull();
		expect(data).not.toBeNull();
	});

	it('a member of an unrelated org cannot read the brand-assets object', async () => {
		const brandB = await personaClient('brandBAdmin');
		const { error, data } = await brandB.storage.from('brand-assets').download(BRAND_ASSET_PATH);
		expect(error, 'unrelated org must not download brand assets').not.toBeNull();
		expect(data).toBeNull();
	});

	it('a member of an unrelated org cannot read the expense-receipts object', async () => {
		const brandB = await personaClient('brandBAdmin');
		const { error, data } = await brandB.storage.from('expense-receipts').download(RECEIPT_PATH);
		expect(error, 'unrelated org must not download expense receipts').not.toBeNull();
		expect(data).toBeNull();
	});

	it('anon cannot upload to brand-assets', async () => {
		const { error } = await anonClient()
			.storage.from('brand-assets')
			.upload(`${RLS_IDS.orgBrandA}/anon-upload-attempt.txt`, new Blob(['anon']), {
				upsert: true
			});
		expect(error, 'anon must not upload to brand-assets').not.toBeNull();
	});

	it('anon cannot upload to expense-receipts', async () => {
		const { error } = await anonClient()
			.storage.from('expense-receipts')
			.upload(`${RLS_IDS.orgBrandA}/anon-upload-attempt.txt`, new Blob(['anon']), {
				upsert: true
			});
		expect(error, 'anon must not upload to expense-receipts').not.toBeNull();
	});

	it('a connected rep can read the connected brand org asset via brand_assets federation', async () => {
		// "Brand assets readable via owning record" delegates to brand_assets,
		// which carries its own federation SELECT policy ("Brand assets
		// visible via federation", USING organization_id IN
		// get_connected_org_ids()). RLS_IDS.connActive connects orgRepA to
		// orgBrandA as an active connection, so repAAdmin should inherit read
		// access to Brand A's asset without any storage-specific federation
		// logic.
		const repA = await personaClient('repAAdmin');
		const { error, data } = await repA.storage.from('brand-assets').download(BRAND_ASSET_PATH);
		expect(
			error,
			`expected federation inheritance to allow this download, got ${error?.message}`
		).toBeNull();
		expect(data).not.toBeNull();
	});
});
