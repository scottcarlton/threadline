import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This test file lives at <repo-root>/tests/rls/admin-bypass.test.ts, so
// walking up two directories from this file gives the repo root regardless
// of the working directory vitest was invoked from.
const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/**
 * supabaseAdmin bypasses RLS. This test does not verify that any of the
 * files below have a correct server-derived ownership check. It only pins
 * the current inventory of call sites so that a NEW bypass cannot land
 * unnoticed: if the inventory changes, this test fails and a human has to
 * make a decision (review the new site and add it here, or remove a
 * deleted one) instead of the change slipping through silently.
 *
 * To update: add or remove the path here in the same PR that adds or
 * removes the supabaseAdmin call site. Reviewing the site for a
 * server-derived ownership check is a separate, manual responsibility this
 * test cannot enforce.
 */
const KNOWN_BYPASS_FILES: string[] = [
	'src/hooks.server.ts',
	'src/lib/server/agent-executor.ts',
	'src/lib/server/ai-limits.ts',
	'src/lib/server/ai-tools.ts',
	'src/lib/server/ai-usage.ts',
	'src/lib/server/audit/hook.test.ts',
	'src/lib/server/audit/hook.ts',
	'src/lib/server/audit/query.test.ts',
	'src/lib/server/audit/query.ts',
	'src/lib/server/beta-whitelist.test.ts',
	'src/lib/server/beta-whitelist.ts',
	'src/lib/server/email-intake/outcome.ts',
	'src/lib/server/email-intake/resolve.ts',
	'src/lib/server/email-intake/route.ts',
	'src/lib/server/email.ts',
	'src/lib/server/email/service.ts',
	'src/lib/server/federation.test.ts',
	'src/lib/server/gmail.ts',
	'src/lib/server/insights-engine.ts',
	'src/lib/server/integrations/calendar-sync.ts',
	'src/lib/server/integrations/calendly.ts',
	'src/lib/server/integrations/discord.ts',
	'src/lib/server/integrations/events.test.ts',
	'src/lib/server/integrations/events.ts',
	'src/lib/server/integrations/google-calendar.ts',
	'src/lib/server/integrations/google-sheets.ts',
	'src/lib/server/integrations/microsoft/calendar-user.ts',
	'src/lib/server/integrations/microsoft/oauth.ts',
	'src/lib/server/integrations/microsoft/outlook-user.ts',
	'src/lib/server/integrations/microsoft/teams.ts',
	'src/lib/server/integrations/notion.ts',
	'src/lib/server/integrations/shopify.ts',
	'src/lib/server/integrations/slack.ts',
	'src/lib/server/messaging/agent.ts',
	'src/lib/server/messaging/identity.ts',
	'src/lib/server/messaging/rate-limit.ts',
	'src/lib/server/messaging/session.ts',
	'src/lib/server/messaging/verification-attempts.ts',
	'src/lib/server/notifications.ts',
	'src/lib/server/order-emails.ts',
	'src/lib/server/orders/authorize-order.test.ts',
	'src/lib/server/orders/authorize-order.ts',
	'src/lib/server/orders/load-order-prereqs.ts',
	'src/lib/server/orders/save-line-edits.ts',
	'src/lib/server/orders/submit-order.ts',
	'src/lib/server/queries/expenses.test.ts',
	'src/lib/server/queries/expenses.ts',
	'src/lib/server/queries/scope.test.ts',
	'src/lib/server/queries/scope.ts',
	'src/lib/server/retailers.ts',
	'src/lib/server/setup-status.ts',
	'src/lib/server/user-lookup.ts',
	'src/routes/(auth)/buyer-invite/[token]/+page.server.ts',
	'src/routes/(auth)/invite/[token]/+page.server.ts',
	'src/routes/+layout.server.ts',
	'src/routes/account/+page.server.ts',
	'src/routes/account/team/+page.server.ts',
	'src/routes/accounts/+page.server.ts',
	'src/routes/accounts/[id]/+page.server.ts',
	'src/routes/api/accounts/import/+server.ts',
	'src/routes/api/accounts/list/+server.ts',
	'src/routes/api/accounts/search/+server.ts',
	'src/routes/api/appointments/+server.ts',
	'src/routes/api/brands/[id]/assets/+server.ts',
	'src/routes/api/brands/import/+server.ts',
	'src/routes/api/buyer-invite/accept/+server.ts',
	'src/routes/api/buyer-invite/send/+server.ts',
	'src/routes/api/buyer-team/[profileId]/+server.ts',
	'src/routes/api/buyer-team/invite/+server.ts',
	'src/routes/api/cart/+server.ts',
	'src/routes/api/cart/[productId]/+server.ts',
	'src/routes/api/connect/member/accept/+server.ts',
	'src/routes/api/connections/approve/+server.ts',
	'src/routes/api/connections/commission/+server.ts',
	'src/routes/api/connections/disconnect/+server.ts',
	'src/routes/api/connections/invite-member/+server.ts',
	'src/routes/api/connections/reconnect/+server.ts',
	'src/routes/api/connections/request/+server.ts',
	'src/routes/api/connections/share/+server.ts',
	'src/routes/api/connections/suspend/+server.ts',
	'src/routes/api/contacts/discover/+server.ts',
	'src/routes/api/cron/agent-triggers/+server.ts',
	'src/routes/api/email-outlook/callback/+server.ts',
	'src/routes/api/email-outlook/disconnect/+server.ts',
	'src/routes/api/email/callback/+server.ts',
	'src/routes/api/email/disconnect/+server.ts',
	'src/routes/api/email/inbox/+server.ts',
	'src/routes/api/email/send/+server.ts',
	'src/routes/api/expenses/[id]/receipts/+server.ts',
	'src/routes/api/expenses/[id]/upload-token/+server.ts',
	'src/routes/api/integrations/calendly/callback/+server.ts',
	'src/routes/api/integrations/calendly/disconnect/+server.ts',
	'src/routes/api/integrations/discord/callback/+server.ts',
	'src/routes/api/integrations/discord/disconnect/+server.ts',
	'src/routes/api/integrations/google-calendar/callback/+server.ts',
	'src/routes/api/integrations/google-calendar/disconnect/+server.ts',
	'src/routes/api/integrations/google-calendar/sync/+server.ts',
	'src/routes/api/integrations/google-sheets/callback/+server.ts',
	'src/routes/api/integrations/google-sheets/disconnect/+server.ts',
	'src/routes/api/integrations/google-sheets/export/+server.ts',
	'src/routes/api/integrations/microsoft-calendar/callback/+server.ts',
	'src/routes/api/integrations/microsoft-calendar/disconnect/+server.ts',
	'src/routes/api/integrations/microsoft/callback/+server.ts',
	'src/routes/api/integrations/microsoft/disconnect/+server.ts',
	'src/routes/api/integrations/microsoft/export/+server.ts',
	'src/routes/api/integrations/notion/callback/+server.ts',
	'src/routes/api/integrations/notion/disconnect/+server.ts',
	'src/routes/api/integrations/notion/sync/+server.ts',
	'src/routes/api/integrations/shopify/callback/+server.ts',
	'src/routes/api/integrations/shopify/disconnect/+server.ts',
	'src/routes/api/integrations/shopify/sync/+server.ts',
	'src/routes/api/integrations/shopify/webhook/+server.ts',
	'src/routes/api/integrations/slack/callback/+server.ts',
	'src/routes/api/integrations/slack/disconnect/+server.ts',
	'src/routes/api/invite/accept/+server.ts',
	'src/routes/api/invite/revoke/+server.ts',
	'src/routes/api/invite/send/+server.ts',
	'src/routes/api/onboarding/create-org/+server.ts',
	'src/routes/api/onboarding/create-retailer/+server.ts',
	'src/routes/api/onboarding/draft/+server.ts',
	'src/routes/api/onboarding/progress/+server.ts',
	'src/routes/api/orders/[id]/clone/+server.ts',
	'src/routes/api/orders/[id]/lines/+server.ts',
	'src/routes/api/orders/[id]/pdf/+server.ts',
	'src/routes/api/orders/[id]/send/+server.ts',
	'src/routes/api/orders/attention/+server.ts',
	'src/routes/api/orders/import/+server.ts',
	'src/routes/api/orders/list/+server.ts',
	'src/routes/api/organization/logo/+server.ts',
	'src/routes/api/products/[productId]/images/+server.ts',
	'src/routes/api/products/[productId]/images/[imageId]/+server.ts',
	'src/routes/api/products/import/+server.ts',
	'src/routes/api/products/variants/[variantId]/stock/+server.ts',
	'src/routes/api/search/+server.ts',
	'src/routes/api/setup/save/+server.ts',
	'src/routes/api/shows/[dateId]/documents/+server.ts',
	'src/routes/api/sso/discover/+server.ts',
	'src/routes/api/sso/enforce/+server.ts',
	'src/routes/api/sso/providers/+server.ts',
	'src/routes/api/sso/providers/[id]/+server.ts',
	'src/routes/api/suggestions/+server.ts',
	'src/routes/api/team/remove/+server.ts',
	'src/routes/api/team/update-commission/+server.ts',
	'src/routes/api/team/update-manager-link/+server.ts',
	'src/routes/api/team/update-manages-others/+server.ts',
	'src/routes/api/team/update-role/+server.ts',
	'src/routes/api/upload/receipt/+server.ts',
	'src/routes/api/webhooks/inbound-email/+server.ts',
	'src/routes/api/webhooks/messaging/+server.ts',
	'src/routes/appointments/+page.server.ts',
	'src/routes/auth/callback/+server.ts',
	'src/routes/brands/[id]/+page.server.ts',
	'src/routes/brands/new/+page.server.ts',
	'src/routes/buyer-invite/[token]/accept/+server.ts',
	'src/routes/connect/[code]/+page.server.ts',
	'src/routes/connect/member/[token]/+page.server.ts',
	'src/routes/expenses/+page.server.ts',
	'src/routes/expenses/[id]/+page.server.ts',
	'src/routes/expenses/new/+page.server.ts',
	'src/routes/insight/+page.server.ts',
	'src/routes/invite/[token]/accept/+server.ts',
	'src/routes/onboarding/+page.svelte',
	'src/routes/orders/+page.server.ts',
	'src/routes/orders/[id]/+page.server.ts',
	'src/routes/orders/confirmation/+page.server.ts',
	'src/routes/orders/confirmation/page.server.test.ts',
	'src/routes/orders/review/[intake_id]/+page.server.ts',
	'src/routes/organization/+layout.server.ts',
	'src/routes/organization/+page.server.ts',
	'src/routes/organization/contacts/+page.server.ts',
	'src/routes/organization/orders/+page.server.ts',
	'src/routes/organization/partners/+page.server.ts',
	'src/routes/organization/payments/+page.server.ts',
	'src/routes/organization/returns/+page.server.ts',
	'src/routes/organization/security/+page.server.ts',
	'src/routes/organization/shipping/+page.server.ts',
	'src/routes/organization/taxes/+page.server.ts',
	'src/routes/products/[productId]/+page.server.ts',
	'src/routes/products/new/+page.server.ts',
	'src/routes/reports/[slug]/+page.server.ts',
	'src/routes/settings/email-intake/+page.server.ts',
	'src/routes/shop/[productId]/+page.server.ts',
	'src/routes/shop/checkout/+page.server.ts',
	'src/routes/system/+page.server.ts',
	'src/routes/system/organizations/+page.server.ts',
	'src/routes/system/organizations/[id]/+page.server.ts',
	'src/routes/system/users/+page.server.ts',
	'src/routes/system/users/[id]/+page.server.ts',
	'src/routes/upload/[token]/+page.server.ts'
];

function currentBypassFiles(): string[] {
	const out = execSync("grep -rl 'supabaseAdmin' src --include=*.ts --include=*.svelte || true", {
		encoding: 'utf8',
		cwd: REPO_ROOT
	});
	return out
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && line !== 'src/lib/server/supabase.ts')
		.sort();
}

describe('supabaseAdmin bypass inventory', () => {
	it('has a non-empty inventory computed from the repo root', () => {
		const current = currentBypassFiles();
		expect(current.length).toBeGreaterThan(0);
	});

	it('has not changed without review', () => {
		const current = currentBypassFiles();
		const added = current.filter((f) => !KNOWN_BYPASS_FILES.includes(f));
		const removed = KNOWN_BYPASS_FILES.filter((f) => !current.includes(f));
		expect(
			{ added, removed },
			'A supabaseAdmin call site changed. Review the new site for a ' +
				'server-derived ownership check, then update KNOWN_BYPASS_FILES.'
		).toEqual({ added: [], removed: [] });
	});
});
