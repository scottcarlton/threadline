import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

const BUCKET = 'organization-logos';

function requireAdmin(locals: App.Locals): { error: string; status: number } | null {
	if (!locals.session || !locals.user || !locals.organization) {
		return { error: 'Unauthorized', status: 401 };
	}
	const role = locals.membership?.role;
	if (!role || !['admin', 'owner'].includes(role)) {
		return { error: 'Admin or owner required', status: 403 };
	}
	return null;
}

function fileExtension(name: string): string {
	const idx = name.lastIndexOf('.');
	if (idx < 0 || idx === name.length - 1) return '';
	return name
		.slice(idx + 1)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]/g, '');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return json({ error: denied.error }, { status: denied.status });

	const orgId = locals.organization!.id;
	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) return json({ error: 'Missing file' }, { status: 400 });
	if (!file.type.startsWith('image/')) {
		return json({ error: 'Only image files are accepted' }, { status: 400 });
	}

	const ext = fileExtension(file.name) || 'png';
	const newPath = `${orgId}/logo.${ext}`;

	// Capture the previous path before overwrite so we can delete it
	// if the extension changed (same path = upsert handles it).
	const { data: org } = await supabaseAdmin
		.from('organizations')
		.select('logo_storage_path')
		.eq('id', orgId)
		.single();
	const previousPath = org?.logo_storage_path ?? null;

	const buffer = Buffer.from(await file.arrayBuffer());
	const { error: uploadError } = await supabaseAdmin.storage
		.from(BUCKET)
		.upload(newPath, buffer, { contentType: file.type, upsert: true });

	if (uploadError) {
		console.error('[organization/logo] upload failed', { orgId, newPath, error: uploadError });
		return json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
	}

	const { error: dbError } = await supabaseAdmin
		.from('organizations')
		.update({ logo_storage_path: newPath, updated_at: new Date().toISOString() })
		.eq('id', orgId);

	if (dbError) {
		console.error('[organization/logo] db update failed', { orgId, newPath, error: dbError });
		await supabaseAdmin.storage.from(BUCKET).remove([newPath]);
		return json({ error: 'Save failed: ' + dbError.message }, { status: 500 });
	}

	if (previousPath && previousPath !== newPath) {
		await supabaseAdmin.storage.from(BUCKET).remove([previousPath]);
	}

	return json({ path: newPath }, { status: 200 });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return json({ error: denied.error }, { status: denied.status });

	const orgId = locals.organization!.id;

	const { data: org } = await supabaseAdmin
		.from('organizations')
		.select('logo_storage_path')
		.eq('id', orgId)
		.single();
	const path = org?.logo_storage_path ?? null;

	if (path) {
		const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
		if (removeError) {
			console.error('[organization/logo] storage remove failed', {
				orgId,
				path,
				error: removeError
			});
		}
	}

	const { error: dbError } = await supabaseAdmin
		.from('organizations')
		.update({ logo_storage_path: null, updated_at: new Date().toISOString() })
		.eq('id', orgId);

	if (dbError) {
		return json({ error: 'Save failed: ' + dbError.message }, { status: 500 });
	}

	return json({ ok: true }, { status: 200 });
};
