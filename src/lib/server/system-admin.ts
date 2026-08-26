/**
 * Emails that resolve to the above-org system administrator context.
 *
 * Exported so `scripts/create-system-admin.ts` provisions exactly these
 * identities rather than a hand-typed address that drifts from the gate.
 */
export const SYSTEM_ADMIN_ALLOWLIST = ['scott@threadline.systems'] as const;

const ALLOWLIST = SYSTEM_ADMIN_ALLOWLIST;

export function isSystemAdminEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return (ALLOWLIST as readonly string[]).includes(email.toLowerCase());
}
