import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportShareTtl } from '$lib/schemas/report-share.js';

/**
 * Public, time-limited links to a frozen copy of a report (SCO-151).
 *
 * The link carries a random token; the table stores only its SHA-256. The
 * public page looks a link up by that hash and renders the stored snapshot.
 * It never queries org data, so a link cannot show more than its creator saw.
 *
 * Writes and the public read take the service client as a parameter rather
 * than importing it, so the rules here stay testable. Every caller passes
 * `supabaseAdmin` behind its own check: the org and role for writes, the
 * token itself for the public read.
 */

/** Admin and owner only: a public link sends org data outside the login wall. */
export const REPORT_SHARE_ROLES = new Set(['admin', 'owner']);

export function mayShareReports(role: string | null | undefined): boolean {
	return REPORT_SHARE_ROLES.has(role ?? '');
}

const TTL_MS: Record<ReportShareTtl, number> = {
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000
};

export function shareExpiry(ttl: ReportShareTtl, now: Date): Date {
	return new Date(now.getTime() + TTL_MS[ttl]);
}

/** 32 random bytes, base64url: 43 characters, URL-safe, unguessable. */
export function generateShareToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashShareToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Rejects anything that could not have come from generateShareToken. */
export function isWellFormedToken(token: string): boolean {
	return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export interface ShareLinkRow {
	id: string;
	organization_id: string;
	report: string;
	title: string;
	filter_label: string;
	snapshot: unknown;
	created_at: string;
	expires_at: string;
	revoked_at: string | null;
}

/** Live means neither revoked nor past its expiry. */
export function isShareLive(
	row: Pick<ShareLinkRow, 'expires_at' | 'revoked_at'>,
	now: Date
): boolean {
	return row.revoked_at === null && new Date(row.expires_at).getTime() > now.getTime();
}

export interface ReportSnapshot {
	variant?: string;
	rows: Record<string, unknown>[];
}

/** The stored snapshot, or null if it is not the shape this code writes. */
export function parseSnapshot(value: unknown): ReportSnapshot | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as { variant?: unknown; rows?: unknown };
	if (!Array.isArray(v.rows)) return null;
	if (v.variant !== undefined && typeof v.variant !== 'string') return null;
	return {
		variant: v.variant as string | undefined,
		rows: v.rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
	};
}

export async function createShareLink(
	admin: SupabaseClient,
	input: {
		organizationId: string;
		userId: string;
		report: string;
		title: string;
		filterLabel: string;
		snapshot: ReportSnapshot;
		ttl: ReportShareTtl;
		now?: Date;
	}
): Promise<{ id: string; token: string; expiresAt: string } | null> {
	const token = generateShareToken();
	const expiresAt = shareExpiry(input.ttl, input.now ?? new Date()).toISOString();
	const { data, error } = await admin
		.from('report_share_links')
		.insert({
			organization_id: input.organizationId,
			report: input.report,
			title: input.title,
			filter_label: input.filterLabel,
			snapshot: input.snapshot,
			token_hash: hashShareToken(token),
			created_by: input.userId,
			expires_at: expiresAt
		})
		.select('id')
		.single();
	if (error || !data) return null;
	return { id: (data as { id: string }).id, token, expiresAt };
}

/**
 * Revokes a live link in `organizationId`. Keyed on the caller's org so an id
 * from another org matches nothing. Returns false when nothing was revoked.
 */
export async function revokeShareLink(
	admin: SupabaseClient,
	input: { organizationId: string; userId: string; id: string; now?: Date }
): Promise<boolean> {
	const { data, error } = await admin
		.from('report_share_links')
		.update({ revoked_at: (input.now ?? new Date()).toISOString(), revoked_by: input.userId })
		.eq('id', input.id)
		.eq('organization_id', input.organizationId)
		.is('revoked_at', null)
		.select('id');
	return !error && (data ?? []).length === 1;
}

/**
 * The public read. Possession of the token is the whole authorization, so a
 * malformed, unknown, revoked or expired token all return null and the page
 * cannot tell them apart.
 */
export async function resolveShareToken(
	admin: SupabaseClient,
	token: string,
	now: Date = new Date()
): Promise<(ShareLinkRow & { snapshot: ReportSnapshot; orgName: string | null }) | null> {
	if (!isWellFormedToken(token)) return null;
	const { data, error } = await admin
		.from('report_share_links')
		.select(
			'id, organization_id, report, title, filter_label, snapshot, created_at, expires_at, revoked_at, organizations(name)'
		)
		.eq('token_hash', hashShareToken(token))
		.maybeSingle();
	if (error || !data) return null;

	const row = data as unknown as ShareLinkRow & {
		organizations: { name?: string } | { name?: string }[] | null;
	};
	if (!isShareLive(row, now)) return null;
	const snapshot = parseSnapshot(row.snapshot);
	if (!snapshot) return null;

	const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
	return { ...row, snapshot, orgName: org?.name ?? null };
}
