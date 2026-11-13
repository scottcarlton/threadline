import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { loadReport } from '$lib/server/reports/load-report.js';
import {
	createShareLink,
	mayShareReports,
	revokeShareLink
} from '$lib/server/reports/share-links.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';
import { reportShareCreateSchema, reportShareRevokeSchema } from '$lib/schemas/report-share.js';
import { reportFilterLabel, reportTable } from '$lib/utils/report-columns.js';

export type ShareLinkListItem = {
	id: string;
	createdAt: string;
	expiresAt: string;
	createdByName: string | null;
};

type LoadedReport = {
	report: string;
	title: string;
	year: number;
	rows: Record<string, unknown>[];
	variant?: string;
	daysBack?: number;
};

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const data = await loadReport(locals, params.slug, url);

	// Share links (SCO-151) are admin/owner only. Read through RLS, whose
	// SELECT policy is the same role check, so nobody else gets a list.
	const canShare = !!locals.organization && mayShareReports(locals.membership?.role);
	let shareLinks: ShareLinkListItem[] = [];
	if (canShare) {
		const { data: links, error } = await locals.supabase
			.from('report_share_links')
			.select(
				'id, created_at, expires_at, profiles!report_share_links_created_by_fkey(display_name)'
			)
			.eq('organization_id', locals.organization!.id)
			.eq('report', params.slug)
			.is('revoked_at', null)
			.gt('expires_at', new Date().toISOString())
			.order('created_at', { ascending: false });
		logSupabaseError('reports share links', error);
		shareLinks = (
			(links ?? []) as Array<{
				id: string;
				created_at: string;
				expires_at: string;
				profiles: { display_name?: string } | { display_name?: string }[] | null;
			}>
		).map((l) => ({
			id: l.id,
			createdAt: l.created_at,
			expiresAt: l.expires_at,
			createdByName:
				(Array.isArray(l.profiles) ? l.profiles[0]?.display_name : l.profiles?.display_name) ?? null
		}));
	}

	return {
		...data,
		canShare,
		shareLinks,
		shareForm: await superValidate(zod4(reportShareCreateSchema), { id: 'report-share' }),
		revokeForm: await superValidate(zod4(reportShareRevokeSchema), { id: 'report-share-revoke' })
	};
};

export const actions: Actions = {
	/**
	 * Freezes the report as the caller sees it now and returns a public link.
	 * The rows come from the same loader as the page, so the snapshot holds
	 * exactly the caller's scope and nothing wider.
	 */
	share: async ({ request, locals, params, url }) => {
		const form = await superValidate(request, zod4(reportShareCreateSchema), {
			id: 'report-share'
		});
		if (!form.valid) return fail(400, { form });

		const org = locals.organization;
		const userId = locals.user?.id;
		if (!org || !userId) return fail(401, { form, message: 'Sign in to share a report.' });
		if (!mayShareReports(locals.membership?.role)) {
			return fail(403, { form, message: 'Only an admin or owner can share a report.' });
		}

		// A form action's URL drops the page's query string, so the filter
		// arrives in the form and is put back here.
		const reportUrl = new URL(url);
		reportUrl.search = '';
		if (form.data.year) reportUrl.searchParams.set('year', String(form.data.year));
		if (form.data.days) reportUrl.searchParams.set('days', String(form.data.days));

		const data = (await loadReport(locals, params.slug, reportUrl)) as LoadedReport;
		if (!reportTable(data.report, data.variant) || data.rows.length === 0) {
			return fail(400, { form, message: 'This report has nothing to share yet.' });
		}

		// Admin client behind the role and org checks above. RLS grants no write.
		const created = await createShareLink(supabaseAdmin, {
			organizationId: org.id,
			userId,
			report: data.report,
			title: data.title,
			filterLabel: reportFilterLabel(data.report, data.year, data.daysBack),
			snapshot: { variant: data.variant, rows: data.rows },
			ttl: form.data.ttl
		});
		if (!created) return fail(500, { form, message: 'Could not create the link.' });

		locals.audit.record('report.shared', {
			organizationId: org.id,
			subjectId: created.id,
			subjectLabel: data.title,
			metadata: { report: data.report, ttl: form.data.ttl, expiresAt: created.expiresAt }
		});

		return message(form, {
			type: 'success' as const,
			url: `${url.origin}/reports/shared/${created.token}`,
			expiresAt: created.expiresAt
		});
	},

	revokeShare: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(reportShareRevokeSchema), {
			id: 'report-share-revoke'
		});
		if (!form.valid) return fail(400, { form });

		const org = locals.organization;
		const userId = locals.user?.id;
		if (!org || !userId) return fail(401, { form, message: 'Sign in to revoke a link.' });
		if (!mayShareReports(locals.membership?.role)) {
			return fail(403, { form, message: 'Only an admin or owner can revoke a link.' });
		}

		// Keyed on the caller's org, so an id from another org revokes nothing.
		const revoked = await revokeShareLink(supabaseAdmin, {
			organizationId: org.id,
			userId,
			id: form.data.id
		});
		if (!revoked) return fail(404, { form, message: 'That link is already gone.' });

		locals.audit.record('report.share_revoked', {
			organizationId: org.id,
			subjectId: form.data.id
		});

		return message(form, { type: 'success' as const });
	}
};
