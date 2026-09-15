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
 *   show_date_documents / expense_receipts), so this suite proves the
 *   delegation actually works -- including that it inherits brand_assets'
 *   federation policy, and that show_date_documents (missing from the
 *   delegation before this fix, which would have made every show-date
 *   document invisible to everyone) is covered -- not just that anon is
 *   blocked.
 *
 *   INSERT/DELETE are scoped by the org id in the object path's first
 *   segment, matching the `${orgId}/...` convention every upload endpoint
 *   already writes (src/routes/api/brands/[id]/assets,
 *   src/routes/api/expenses/[id]/receipts, src/routes/api/upload/receipt,
 *   src/routes/api/shows/[dateId]/documents,
 *   src/lib/server/products/upload-image.ts), including a positive control
 *   (an org member CAN write under their own org prefix -- without this the
 *   anon-denial tests would pass equally well against a policy that denies
 *   everyone) and both shapes of the CASE guard around the path segment's
 *   ::uuid cast (bucket-root path, non-uuid segment), asserted on the error
 *   message so a clean denial isn't confused with a cast error aborting the
 *   statement.
 *
 *   organization-logos is covered in both directions: anon cannot write or
 *   delete, but anon CAN still read, since that bucket is deliberately
 *   public and the fix must not have over-tightened it.
 *
 * Real objects are uploaded with the service-role client (mirroring how
 * the app writes: every upload endpoint uses supabaseAdmin, which bypasses
 * RLS) and removed in a `finally` via the storage API, per
 * storage.objects' protect_delete trigger which blocks a plain table
 * DELETE. A `sweepOrphans()` pass in beforeAll deletes rows/objects matching
 * this suite's fixed probe paths before seeding, so a run killed mid-way
 * (this suite has died twice from environment failures, not from bad
 * fixtures) self-heals on the next run instead of colliding on stale state.
 */

const BRAND_ASSET_PATH = `${RLS_IDS.orgBrandA}/${RLS_IDS.brandA1}/rls-storage-probe-asset.txt`;
const RECEIPT_PATH = `${RLS_IDS.orgBrandA}/rls-storage-probe/rls-storage-probe-receipt.txt`;

// src/routes/api/shows/[dateId]/documents/+server.ts writes brand-assets
// objects at `${orgId}/shows/${dateId}/...` and records them in
// show_date_documents, NOT brand_assets. Before this fix, that table was
// missing from "Brand assets readable via owning record"'s delegation, so
// every show-date document would have been invisible to every authenticated
// user, including the uploading org's own admins.
const SHOW_ID = crypto.randomUUID();
const SHOW_DATE_ID = crypto.randomUUID();
const SHOW_DOC_PATH = `${RLS_IDS.orgBrandA}/shows/${SHOW_DATE_ID}/rls-storage-probe-show-doc.txt`;

// Row ids are `string | undefined`, not `string`, so afterAll can guard each
// delete rather than assume beforeAll ran to completion. Two earlier runs of
// this suite died mid-beforeAll (machine sleep, then a stall); an
// unconditional `.eq('id', undefined)` on the next run's cleanup is noisy at
// best and at worst matches nothing while looking like it worked.
let brandAssetRowId: string | undefined;
let brandExpenseId: string | undefined;
let receiptRowId: string | undefined;
let showDateDocRowId: string | undefined;

async function uploadObject(bucket: string, path: string): Promise<void> {
	const { error } = await adminClient()
		.storage.from(bucket)
		.upload(path, new Blob(['probe']), { upsert: true });
	if (error) throw new Error(`storage probe upload to ${bucket}/${path} failed: ${error.message}`);
}

async function removeObject(bucket: string, path: string): Promise<void> {
	await adminClient().storage.from(bucket).remove([path]);
}

/**
 * Removes any rows/objects a prior, killed run of this suite could have left
 * behind, matched by the fixed probe paths above. Runs before any insert
 * below, so a self-healing re-run never trips a UNIQUE/duplicate-path
 * conflict on the real seeding that follows. Table deletes go through
 * admin (bypasses RLS); objects go through the storage API, since
 * storage.objects has a protect_delete trigger that blocks a plain SQL
 * DELETE.
 */
async function sweepOrphans(): Promise<void> {
	const admin = adminClient();
	await admin.from('show_date_documents').delete().eq('file_path', SHOW_DOC_PATH);
	await admin.from('show_dates').delete().eq('id', SHOW_DATE_ID);
	await admin.from('shows').delete().eq('id', SHOW_ID);
	await admin.from('expense_receipts').delete().eq('file_path', RECEIPT_PATH);
	await admin.from('brand_assets').delete().eq('file_path', BRAND_ASSET_PATH);
	await removeObject('brand-assets', BRAND_ASSET_PATH);
	await removeObject('expense-receipts', RECEIPT_PATH);
	await removeObject('brand-assets', SHOW_DOC_PATH);
}

beforeAll(async () => {
	const admin = adminClient();

	await sweepOrphans();

	// Real objects, owned by RLS Brand A, so the SELECT policies' EXISTS
	// delegation to brand_assets / expense_receipts has something to match
	// against. Uploaded via the service-role client, same as every real
	// upload endpoint.
	await uploadObject('brand-assets', BRAND_ASSET_PATH);
	await uploadObject('expense-receipts', RECEIPT_PATH);
	await uploadObject('brand-assets', SHOW_DOC_PATH);

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

	const { error: showErr } = await admin
		.from('shows')
		.insert({ id: SHOW_ID, organization_id: RLS_IDS.orgBrandA, name: 'RLS storage probe show' });
	if (showErr) {
		throw new Error(`shows insert failed: ${showErr.message}`);
	}

	const { error: showDateErr } = await admin.from('show_dates').insert({
		id: SHOW_DATE_ID,
		show_id: SHOW_ID,
		organization_id: RLS_IDS.orgBrandA,
		year: 2026,
		month: 1
	});
	if (showDateErr) {
		throw new Error(`show_dates insert failed: ${showDateErr.message}`);
	}

	const { data: showDoc, error: showDocErr } = await admin
		.from('show_date_documents')
		.insert({
			show_date_id: SHOW_DATE_ID,
			organization_id: RLS_IDS.orgBrandA,
			name: 'RLS storage probe show doc',
			file_path: SHOW_DOC_PATH
		})
		.select('id')
		.single();
	if (showDocErr || !showDoc) {
		throw new Error(`show_date_documents insert failed: ${showDocErr?.message}`);
	}
	showDateDocRowId = (showDoc as { id: string }).id;
});

afterAll(async () => {
	const admin = adminClient();
	try {
		if (receiptRowId) await admin.from('expense_receipts').delete().eq('id', receiptRowId);
		if (brandExpenseId) await admin.from('brand_expenses').delete().eq('id', brandExpenseId);
		if (brandAssetRowId) await admin.from('brand_assets').delete().eq('id', brandAssetRowId);
		if (showDateDocRowId) {
			await admin.from('show_date_documents').delete().eq('id', showDateDocRowId);
		}
		await admin.from('show_dates').delete().eq('id', SHOW_DATE_ID);
		await admin.from('shows').delete().eq('id', SHOW_ID);
	} finally {
		await removeObject('brand-assets', BRAND_ASSET_PATH);
		await removeObject('expense-receipts', RECEIPT_PATH);
		await removeObject('brand-assets', SHOW_DOC_PATH);
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

	it('an org member can read a show-date document via show_date_documents delegation', async () => {
		// This is the regression test for the most serious finding in review:
		// "Brand assets readable via owning record" originally delegated to
		// brand_assets and product_images only. show_date_documents' own SELECT
		// policy ("Show date docs visible to org members", USING
		// is_org_member(organization_id)) grants brandAAdmin visibility here --
		// the storage policy's job is only to inherit that, not to re-derive it.
		const brandA = await personaClient('brandAAdmin');
		const { error, data } = await brandA.storage.from('brand-assets').download(SHOW_DOC_PATH);
		expect(
			error,
			`expected show_date_documents delegation to allow this download, got ${error?.message}`
		).toBeNull();
		expect(data).not.toBeNull();
	});

	it('an org member can upload to brand-assets under their own org prefix', async () => {
		// Positive control for the write side: without this, "anon cannot
		// upload" would pass equally well against a policy that denies
		// everyone, authenticated included.
		//
		// upsert: false, matching every real upload endpoint (they write
		// timestamped paths and never overwrite). upsert: true issues an
		// INSERT ... ON CONFLICT DO UPDATE, which Postgres RLS requires an
		// UPDATE policy for even when no conflict occurs -- and this bucket
		// deliberately has none (see the migration's own comment on that).
		// Using upsert: true here would make this "positive control" fail
		// for a reason that has nothing to do with the INSERT policy being
		// tested.
		const path = `${RLS_IDS.orgBrandA}/rls-storage-probe-write-control.txt`;
		const brandA = await personaClient('brandAAdmin');
		try {
			const { error } = await brandA.storage
				.from('brand-assets')
				.upload(path, new Blob(['write control']), { upsert: false });
			expect(error, `expected own-org upload to succeed, got ${error?.message}`).toBeNull();
		} finally {
			await removeObject('brand-assets', path);
		}
	});

	it('a member of an unrelated org cannot upload under another org prefix', async () => {
		const path = `${RLS_IDS.orgBrandA}/rls-storage-probe-cross-org-write.txt`;
		const brandB = await personaClient('brandBAdmin');
		try {
			const { error } = await brandB.storage
				.from('brand-assets')
				.upload(path, new Blob(['cross org']), { upsert: false });
			expect(error, 'unrelated org must not upload under another org prefix').not.toBeNull();
		} finally {
			// Denied INSERTs do not create a row, but clean up defensively in
			// case that assumption is ever wrong.
			await removeObject('brand-assets', path);
		}
	});

	// The write policies guard the ::uuid cast on the first path segment with
	// a CASE expression: a non-uuid segment falls through to `else false`
	// (denied) instead of reaching `::uuid` and raising "invalid input syntax
	// for type uuid", which would abort the statement rather than cleanly
	// deny the row. Empirically, both shapes below surface through the
	// storage API as the same StorageApiError the ordinary cross-org denial
	// above produces -- "new row violates row-level security policy", status
	// 400/403 -- not a Postgres cast-error message. Asserting on the message
	// (not just that `error` is non-null) is what actually distinguishes a
	// clean denial from a cast error; both produce a non-null error.
	//
	// upsert: false on both, for the same reason as the positive control
	// above: upsert: true would fail regardless of the CASE guard, because
	// this bucket has no UPDATE policy, and that failure would produce the
	// identical "row-level security policy" message -- silently proving
	// nothing about the guard itself.
	it('a bucket-root path (no folder segment) is denied cleanly, not with a cast error', async () => {
		// storage.foldername() returns an empty array for a path with no `/`,
		// so `(storage.foldername(name))[1]` is NULL and the `~` regex match
		// against NULL is NULL, which is falsy -- the CASE falls to `else
		// false` before ever reaching the ::uuid cast.
		const brandA = await personaClient('brandAAdmin');
		const { error } = await brandA.storage
			.from('brand-assets')
			.upload('rls-storage-probe-root.txt', new Blob(['root']), { upsert: false });
		expect(error, 'a bucket-root upload must be denied').not.toBeNull();
		expect(error?.message).toContain('row-level security policy');
		expect(error?.message.toLowerCase()).not.toContain('invalid input syntax');
		expect(error?.message.toLowerCase()).not.toContain('uuid');
	});

	it('a non-uuid first path segment is denied cleanly, not with a cast error', async () => {
		const brandA = await personaClient('brandAAdmin');
		const { error } = await brandA.storage
			.from('brand-assets')
			.upload('legacy/rls-storage-probe-legacy.txt', new Blob(['legacy']), { upsert: false });
		expect(error, 'a non-uuid first segment upload must be denied').not.toBeNull();
		expect(error?.message).toContain('row-level security policy');
		expect(error?.message.toLowerCase()).not.toContain('invalid input syntax');
		expect(error?.message.toLowerCase()).not.toContain('uuid');
	});

	it('anon cannot upload to organization-logos', async () => {
		const { error } = await anonClient()
			.storage.from('organization-logos')
			.upload(`${RLS_IDS.orgBrandA}/rls-storage-probe-logo-write.txt`, new Blob(['logo']), {
				upsert: true
			});
		expect(error, 'anon must not upload to organization-logos').not.toBeNull();
	});

	it('anon cannot delete from organization-logos', async () => {
		// storage `.remove()` on a row RLS denies does not return an error --
		// DELETE just matches zero rows and the call resolves with
		// `{ data: [], error: null }`. The only way to prove the delete was
		// actually denied, rather than degenerately "succeeding" against
		// nothing, is to seed a real object first and then assert it is
		// still downloadable afterward.
		const admin = adminClient();
		const path = `${RLS_IDS.orgBrandA}/rls-storage-probe-logo-delete.txt`;
		try {
			await uploadObject('organization-logos', path);
			await anonClient().storage.from('organization-logos').remove([path]);
			const { error, data } = await admin.storage.from('organization-logos').download(path);
			expect(error, 'organization-logos object must survive an anon delete attempt').toBeNull();
			expect(data).not.toBeNull();
		} finally {
			await removeObject('organization-logos', path);
		}
	});

	it('anon can still read organization-logos (SELECT stays public by design)', async () => {
		// This bucket is `public = true` on purpose (app header, /connect/[code]
		// need <img src> without re-signing). This asserts the fix closed the
		// write hole without over-tightening the deliberately public read side.
		const path = `${RLS_IDS.orgBrandA}/rls-storage-probe-logo-read.txt`;
		try {
			await uploadObject('organization-logos', path);
			const { error, data } = await anonClient().storage.from('organization-logos').download(path);
			expect(
				error,
				`expected anon to still read organization-logos, got ${error?.message}`
			).toBeNull();
			expect(data).not.toBeNull();
		} finally {
			await removeObject('organization-logos', path);
		}
	});
});
