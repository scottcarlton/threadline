import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';

beforeAll(loadPersonaIds);

const OBJECT_PATH = 'rls-test/probe.txt';

async function uploadProbe(bucket: string): Promise<void> {
	const { error } = await adminClient()
		.storage.from(bucket)
		.upload(OBJECT_PATH, new Blob(['probe']), { upsert: true });
	if (error) throw new Error(`storage probe upload to ${bucket} failed: ${error.message}`);
}

async function removeProbe(bucket: string): Promise<void> {
	await adminClient().storage.from(bucket).remove([OBJECT_PATH]);
}

describe('storage bucket policies', () => {
	// SECURITY FINDING: this is worse than docs/brd/permissions-implementation-map.md
	// §A.3 documents. §A.3 lists `brand-assets` SELECT as
	// `bucket_id = 'brand-assets'` "(authenticated)", implying an
	// unauthenticated request is blocked. It is not. The live policy
	// (supabase/migrations/20260405000010_brand_assets.sql):
	//
	//   CREATE POLICY "Org members can read brand assets"
	//     ON storage.objects FOR SELECT
	//     USING (bucket_id = 'brand-assets');
	//
	// has no auth.role() or auth.uid() check at all, and pg_policies shows
	// it applies to role "public" (anon and authenticated alike). The
	// `anon`/`authenticated` grants on storage.objects are also both
	// present. Verified empirically: an anon-key client with no session
	// downloads an uploaded object with no error. The matching INSERT
	// policy ("Members can upload brand assets", WITH CHECK (bucket_id =
	// 'brand-assets')) has the identical gap: an anon client can also
	// upload into the bucket. So this is not "any authenticated user of any
	// org can read", it is "anyone on the internet, logged in or not, can
	// read and write brand-assets (and expense-receipts, same policy
	// shape)". Marked it.fails so a real fix flips this back to green and
	// forces someone to notice.
	it.fails(
		'anon cannot read a brand-assets object (BLOCKED: SELECT policy has no auth check, anon reads succeed)',
		async () => {
			await uploadProbe('brand-assets');
			try {
				const { error } = await anonClient().storage.from('brand-assets').download(OBJECT_PATH);
				expect(error, 'anon must not download brand assets').not.toBeNull();
			} finally {
				await removeProbe('brand-assets');
			}
		}
	);

	/**
	 * Documented gap: A.3 says both buckets are gated on `authenticated`
	 * only, with no organization scoping. This test asserts the CURRENT
	 * behavior so it is visible and diffable. It is not an endorsement.
	 * See the ticket raised in Step 3.
	 */
	it('any authenticated user of any org can read a brand-assets object', async () => {
		await uploadProbe('brand-assets');
		try {
			const outsider = await personaClient('repBAdmin');
			const { data, error } = await outsider.storage.from('brand-assets').download(OBJECT_PATH);
			expect(error).toBeNull();
			expect(data).not.toBeNull();
		} finally {
			await removeProbe('brand-assets');
		}
	});

	it('expense-receipts behaves the same way', async () => {
		await uploadProbe('expense-receipts');
		try {
			const outsider = await personaClient('repBAdmin');
			const { error } = await outsider.storage.from('expense-receipts').download(OBJECT_PATH);
			expect(error).toBeNull();
		} finally {
			await removeProbe('expense-receipts');
		}
	});
});
