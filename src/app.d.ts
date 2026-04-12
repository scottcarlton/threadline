import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Profile, Organization, OrganizationMember, UserRole, OrgType, AccountUser } from '$lib/types/database';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: import('@supabase/supabase-js').User | null }>;
			session: Session | null;
			user: Profile | null;
			membership: OrganizationMember | null;
			organization: Organization | null;
			orgType: OrgType;
			allMemberships: (OrganizationMember & { organizations: Organization })[];
			brandScope: string[] | null; // null = all brands, string[] = scoped brand IDs
			scopedBrandNames: string[] | null;
			isBuyer: boolean;
			buyerAccounts: AccountUser[] | null;
			buyerBrandIds: string[] | null;
		}
		interface PageData {
			session: Session | null;
			user: Profile | null;
			membership: OrganizationMember | null;
			organization: Organization | null;
			orgType: OrgType;
			allMemberships: (OrganizationMember & { organizations: Organization })[];
			brandScope: string[] | null;
			scopedBrandNames: string[] | null;
			isBuyer: boolean;
			buyerAccounts: AccountUser[] | null;
			buyerBrandIds: string[] | null;
		}
	}
}

export {};
