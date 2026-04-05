export type UserRole = 'admin' | 'owner' | 'member' | 'guest';
export type OrderStatus = 'draft' | 'submitted' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

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

export interface Brand {
	id: string;
	organization_id: string;
	name: string;
	logo_url: string | null;
	contact_name: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	website: string | null;
	notes: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface Account {
	id: string;
	organization_id: string;
	business_name: string;
	contact_name: string | null;
	contact_email: string | null;
	phone: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	country: string;
	notes: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface Season {
	id: string;
	organization_id: string;
	name: string;
	sort_order: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface Show {
	id: string;
	organization_id: string;
	season_id: string | null;
	year: number | null;
	name: string;
	venue: string | null;
	city: string | null;
	state: string | null;
	start_date: string | null;
	end_date: string | null;
	notes: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
	seasons?: Season;
}

export interface Order {
	id: string;
	organization_id: string;
	order_number: string;
	account_id: string;
	brand_id: string;
	season_id: string | null;
	order_year: number | null;
	show_id: string | null;
	status: OrderStatus;
	total_amount: number;
	notes: string | null;
	created_by: string;
	submitted_at: string | null;
	confirmed_at: string | null;
	shipped_at: string | null;
	delivered_at: string | null;
	cancelled_at: string | null;
	created_at: string;
	updated_at: string;
	brands?: Brand;
	accounts?: Account;
	seasons?: Season;
	shows?: Show;
}

export interface OrderLine {
	id: string;
	order_id: string;
	style_number: string | null;
	description: string | null;
	color: string | null;
	size: string | null;
	qty: number;
	unit_price: number;
	line_total: number;
	sort_order: number;
	created_at: string;
}
