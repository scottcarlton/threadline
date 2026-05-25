const ALLOWLIST = ['scott@threadline.systems'] as const;

export function isSystemAdminEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return (ALLOWLIST as readonly string[]).includes(email.toLowerCase());
}
