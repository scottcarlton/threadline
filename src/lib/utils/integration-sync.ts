import type { IntegrationProvider, IntegrationSyncLog } from '$lib/types/database.js';

/**
 * Providers with a management page at `/organization/integrations/[provider]`.
 * The page's loader 404s on anything else, so the list only links these.
 */
export const MANAGEABLE_PROVIDERS: readonly IntegrationProvider[] = [
	'google_sheets',
	'slack',
	'notion',
	'microsoft'
];

export function isManageableProvider(provider: IntegrationProvider): boolean {
	return MANAGEABLE_PROVIDERS.includes(provider);
}

export type LatestSync = Pick<IntegrationSyncLog, 'status' | 'created_at'>;

/**
 * The most recent sync log row per connection. Input order does not matter;
 * the newest `created_at` wins.
 */
export function latestSyncByConnection(
	logs: Pick<IntegrationSyncLog, 'connection_id' | 'status' | 'created_at'>[]
): Record<string, LatestSync> {
	const latest: Record<string, LatestSync> = {};
	for (const log of logs) {
		const current = latest[log.connection_id];
		if (!current || log.created_at > current.created_at) {
			latest[log.connection_id] = { status: log.status, created_at: log.created_at };
		}
	}
	return latest;
}
