/**
 * Emails that resolve to the above-org system administrator context.
 *
 * Exported so `scripts/create-system-admin.ts` provisions exactly these
 * identities rather than a hand-typed address that drifts from the gate.
 */
export const SYSTEM_ADMIN_ALLOWLIST = ['scott@threadline.systems'] as const;

/**
 * What the chrome calls a system admin.
 *
 * The provisioning script seeds `profiles.display_name` from the email, so the
 * navbar read "scott@threadline.systems". The console is an above-org context
 * rather than a person's org profile, so it gets a generic name until real
 * system-user profiles exist.
 */
export const SYSTEM_ADMIN_DISPLAY_NAME = 'System User';

const ALLOWLIST = SYSTEM_ADMIN_ALLOWLIST;

export function isSystemAdminEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return (ALLOWLIST as readonly string[]).includes(email.toLowerCase());
}
