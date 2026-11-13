import { z } from 'zod';

/** How long a public report link lives (SCO-151). */
export const REPORT_SHARE_TTLS = ['24h', '7d', '30d'] as const;
export type ReportShareTtl = (typeof REPORT_SHARE_TTLS)[number];

export const REPORT_SHARE_TTL_LABELS: Record<ReportShareTtl, string> = {
	'24h': '24 hours',
	'7d': '7 days',
	'30d': '30 days'
};

/**
 * Creating a link. The year and days fields carry the page's filter, because
 * a form action's URL does not keep the page's query string.
 */
export const reportShareCreateSchema = z.object({
	ttl: z.enum(REPORT_SHARE_TTLS).default('7d'),
	year: z.coerce.number().int().min(2000).max(2100).optional(),
	days: z.coerce.number().int().min(1).max(365).optional()
});

export const reportShareRevokeSchema = z.object({
	id: z.uuid()
});
