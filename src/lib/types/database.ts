export type UserRole = 'admin' | 'owner' | 'member' | 'guest';

export interface Profile {
	id: string;
	display_name: string;
	avatar_url: string | null;
	created_at: string;
	updated_at: string;
}

export interface Organization {
	id: string;
	name: string;
	slug: string;
	logo_url: string | null;
	created_at: string;
	updated_at: string;
}

export interface OrganizationMember {
	id: string;
	organization_id: string;
	profile_id: string;
	role: UserRole;
	invited_by: string | null;
	invited_at: string;
	accepted_at: string | null;
	created_at: string;
	organizations?: Organization;
}

export interface Invitation {
	id: string;
	organization_id: string;
	email: string;
	role: UserRole;
	brand_ids: string[];
	token: string;
	invited_by: string;
	expires_at: string;
	accepted_at: string | null;
	created_at: string;
	organizations?: Organization;
}
