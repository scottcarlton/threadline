import type { OrgType } from '$lib/types/database.js';

export function isBrandOrg(orgType: OrgType | null | undefined): boolean {
	return orgType === 'brand';
}

export function isRepOrg(orgType: OrgType | null | undefined): boolean {
	return orgType === 'rep';
}
