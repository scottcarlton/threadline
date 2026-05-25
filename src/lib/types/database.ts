export type UserRole = 'admin' | 'owner' | 'member' | 'sales' | 'guest';
export type OrgType = 'rep' | 'brand';
export type IntegrationProvider =
	| 'google_sheets'
	| 'slack'
	| 'notion'
	| 'microsoft'
	| 'discord'
	| 'shopify';
export type OrderStatus =
	| 'draft'
	| 'submitted'
	| 'confirmed'
	| 'preparing'
	| 'shipped'
	| 'delivered'
	| 'cancelled';
export type OrderType = 'order' | 'note';
export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ExpenseCategory =
	| 'trade_show'
	| 'samples'
	| 'marketing'
	| 'travel'
	| 'meals'
	| 'shipping'
	| 'photography'
	| 'office'
	| 'other';

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
	logo_storage_path: string | null;
	legal_business_name: string | null;
	tagline: string | null;
	sso_enforced: boolean;
	org_type: OrgType;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	country: string;
	time_zone: string;
	currency_code: string;
	accepted_payment_methods: string[];
	default_payment_method: string | null;
	default_commission_rate: number;
	order_number_prefix: string;
	next_order_number: number;
	order_number_pad_width: number;
	order_minimum_enabled: boolean;
	order_minimum_amount: number | null;
	handling_fee_amount: number;
	taxes_pricing_display: 'exclusive' | 'inclusive';
	taxes_us_general_rate: number | null;
	taxes_us_sales_tax_enabled: boolean;
	taxes_us_ein: string | null;
	taxes_vat_enabled: boolean;
	taxes_vat_registration: string | null;
	taxes_vat_rate: number | null;
	taxes_gst_enabled: boolean;
	taxes_gst_registration: string | null;
	taxes_gst_rate: number | null;
	shipping_use_business_address: boolean;
	shipping_from_line1: string | null;
	shipping_from_line2: string | null;
	shipping_from_city: string | null;
	shipping_from_state: string | null;
	shipping_from_zip: string | null;
	shipping_from_country: string | null;
	shipping_free_threshold_enabled: boolean;
	shipping_free_threshold_amount: number | null;
	default_shipping_method: string | null;
	returns_window_days: number;
	returns_policy_text: string | null;
	returns_use_ship_from_address: boolean;
	returns_address_line1: string | null;
	returns_address_line2: string | null;
	returns_address_city: string | null;
	returns_address_state: string | null;
	returns_address_zip: string | null;
	returns_address_country: string | null;
	returns_restocking_fee_type: 'percent' | 'flat';
	returns_restocking_fee_value: number;
	returns_buyer_pays_shipping: boolean;
	default_shipping_method_id: string | null;
	payments_processor: 'stripe' | 'manual';
	payments_stripe_account_id: string | null;
	payments_stripe_link_enabled: boolean;
	payments_required_deposit_enabled: boolean;
	payments_required_deposit_percent: number | null;
	payments_deposit_account_name: string | null;
	payments_deposit_account_last4: string | null;
	payments_surcharge_pass_to_buyer: boolean;
	onboarding_step: number;
	onboarding_completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface OrganizationSalesTaxRate {
	id: string;
	organization_id: string;
	state_code: string;
	rate: number;
	tax_type: 'origin' | 'destination';
	created_at: string;
	updated_at: string;
}

export interface OrganizationShippingMethod {
	id: string;
	organization_id: string;
	name: string;
	cost_type: 'flat' | 'calculated' | 'free';
	cost_amount: number | null;
	delivery_window: string | null;
	created_at: string;
	updated_at: string;
}

// Brand-side commerce satellites — used only when brand.organization_id
// belongs to a rep org (manual brand). Same shape as the org satellites,
// keyed on brand_id.
export interface BrandSalesTaxRate {
	id: string;
	brand_id: string;
	state_code: string;
	rate: number;
	tax_type: 'origin' | 'destination';
	created_at: string;
	updated_at: string;
}

export interface BrandShippingMethod {
	id: string;
	brand_id: string;
	name: string;
	cost_type: 'flat' | 'calculated' | 'free';
	cost_amount: number | null;
	delivery_window: string | null;
	created_at: string;
	updated_at: string;
}

export interface OrganizationMember {
	id: string;
	organization_id: string;
	profile_id: string;
	role: UserRole;
	commission_rate: number;
	manages_others: boolean;
	manager_id: string | null;
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
	commission_rate: number | null;
	manages_others: boolean;
	manager_id: string | null;
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
	contact_first_name: string | null;
	contact_last_name: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	website: string | null;
	notes: string | null;
	commission_rate: number;
	is_active: boolean;
	is_self_brand: boolean;
	archived_at: string | null;
	created_at: string;
	updated_at: string;

	// Commerce settings — populated only on rep-org-owned manual brands.
	// BO-owned brands leave these NULL; the order resolver reads from
	// `organizations` instead. See migration 20260426000001 for shape.
	order_number_prefix: string | null;
	next_order_number: number | null;
	order_number_pad_width: number | null;
	order_minimum_enabled: boolean | null;
	order_minimum_amount: number | null;
	handling_fee_amount: number | null;
	default_commission_rate: number | null;

	taxes_pricing_display: 'exclusive' | 'inclusive' | null;
	taxes_us_sales_tax_enabled: boolean | null;
	taxes_us_ein: string | null;
	taxes_us_general_rate: number | null;
	taxes_vat_enabled: boolean | null;
	taxes_vat_registration: string | null;
	taxes_vat_rate: number | null;
	taxes_gst_enabled: boolean | null;
	taxes_gst_registration: string | null;
	taxes_gst_rate: number | null;

	shipping_use_business_address: boolean | null;
	shipping_from_line1: string | null;
	shipping_from_line2: string | null;
	shipping_from_city: string | null;
	shipping_from_state: string | null;
	shipping_from_zip: string | null;
	shipping_from_country: string | null;
	shipping_free_threshold_enabled: boolean | null;
	shipping_free_threshold_amount: number | null;
	default_shipping_method_id: string | null;

	returns_window_days: number | null;
	returns_policy_text: string | null;
	returns_use_ship_from_address: boolean | null;
	returns_address_line1: string | null;
	returns_address_line2: string | null;
	returns_address_city: string | null;
	returns_address_state: string | null;
	returns_address_zip: string | null;
	returns_address_country: string | null;
	returns_restocking_fee_type: 'percent' | 'flat' | null;
	returns_restocking_fee_value: number | null;
	returns_buyer_pays_shipping: boolean | null;

	payments_processor: 'stripe' | 'manual' | null;
	payments_stripe_account_id: string | null;
	payments_stripe_link_enabled: boolean | null;
	payments_required_deposit_enabled: boolean | null;
	payments_required_deposit_percent: number | null;
	payments_deposit_account_name: string | null;
	payments_deposit_account_last4: string | null;
	payments_surcharge_pass_to_buyer: boolean | null;
	accepted_payment_methods: string[] | null;
	default_payment_method: string | null;
	default_payment_terms: string | null;
}

export interface Account {
	id: string;
	organization_id: string;
	business_name: string;
	website: string | null;
	contact_first_name: string | null;
	contact_last_name: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	phone: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	country: string;
	notes: string | null;
	territory_id: string | null;
	payment_preference: string | null;
	shipping_method: string | null;
	commission_rate_override: number | null;
	order_minimum_override: number | null;
	is_active: boolean;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface AccountLocation {
	id: string;
	account_id: string;
	organization_id: string;
	label: string;
	contact_first_name: string | null;
	contact_last_name: string | null;
	contact_email: string | null;
	phone: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	country: string;
	notes: string | null;
	is_default: boolean;
	sort_order: number;
	created_at: string;
	updated_at: string;
}

export interface Territory {
	id: string;
	organization_id: string;
	brand_id: string | null;
	name: string;
	notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface MemberTerritory {
	organization_member_id: string;
	territory_id: string;
	created_at: string;
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

export interface SeasonDelivery {
	id: string;
	season_id: string;
	organization_id: string;
	label: string;
	delivery_month: number;
	delivery_day: number;
	sort_order: number;
	created_at: string;
	seasons?: Season;
}

export interface Show {
	id: string;
	organization_id: string;
	name: string;
	notes: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface ShowDate {
	id: string;
	show_id: string;
	organization_id: string;
	year: number;
	month: number;
	venue: string | null;
	city: string | null;
	state: string | null;
	start_date: string | null;
	end_date: string | null;
	contact_name: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	notes: string | null;
	created_at: string;
	shows?: Show;
}

export interface ShowDateDocument {
	id: string;
	show_date_id: string;
	organization_id: string;
	name: string;
	file_path: string;
	file_size: number | null;
	mime_type: string | null;
	uploaded_by: string | null;
	created_at: string;
}

export interface SourceType {
	id: string;
	organization_id: string;
	name: string;
	sort_order: number;
	is_active: boolean;
	created_at: string;
}

export interface ShowVisit {
	id: string;
	organization_id: string;
	show_date_id: string;
	account_id: string;
	status: string;
	notes: string | null;
	is_new_account: boolean;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	accounts?: Account;
}

export interface Appointment {
	id: string;
	organization_id: string;
	show_date_id: string;
	account_id: string;
	appointment_type: string;
	location_type: string;
	location_detail: string | null;
	scheduled_date: string | null;
	scheduled_time: string | null;
	duration_minutes: number;
	notes: string | null;
	status: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	accounts?: Account;
	show_dates?: ShowDate;
}

export interface Order {
	id: string;
	organization_id: string;
	order_number: string;
	account_id: string | null;
	freeform_name: string | null;
	location_id: string | null;
	order_type: OrderType;
	brand_id: string;
	season_id: string | null;
	order_year: number | null;
	show_id: string | null;
	show_date_id: string | null;
	source_type_id: string | null;
	delivery_id: string | null;
	expected_ship_date: string | null;
	start_ship_date: string | null;
	status: OrderStatus;
	total_amount: number;
	shipped_amount: number | null;
	notes: string | null;
	created_by: string;
	submitted_at: string | null;
	confirmed_at: string | null;
	shipped_at: string | null;
	delivered_at: string | null;
	cancelled_at: string | null;
	cancelled_reason: string | null;
	connection_id: string | null;
	payment_preference: string | null;
	payment_terms: string | null;
	shipping_method: string | null;
	po_number: string | null;
	bill_to_location_id: string | null;
	rep_user_id: string | null;
	terms_id: string | null;
	terms_agreed_by: string | null;
	terms_agreed_at: string | null;
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
	product_id: string | null;
	variant_id: string | null;
	style_number: string | null;
	description: string | null;
	color: string | null;
	size: string | null;
	qty: number;
	unit_price: number;
	line_total: number;
	sort_order: number;
	original_qty: number | null;
	removed_at: string | null;
	removed_reason: string | null;
	created_at: string;
}

export interface Product {
	id: string;
	organization_id: string;
	brand_id: string;
	style_number: string;
	name: string;
	description: string | null;
	wholesale_price: number;
	retail_price: number | null;
	category: string | null;
	subcategory: string | null;
	season_id: string | null;
	product_year: number | null;
	ats: boolean;
	is_featured: boolean;
	shopify_product_id: string | null;
	is_active: boolean;
	archived_at: string | null;
	created_at: string;
	updated_at: string;
	updated_by: string | null;
	attributes: string[];
}

export interface ProductVariant {
	id: string;
	product_id: string;
	color: string | null;
	color_hex: string | null;
	size: string | null;
	sku: string | null;
	barcode: string | null;
	price_override: number | null;
	stock_qty: number | null;
	stock_threshold: number | null;
	shopify_variant_id: string | null;
	shopify_inventory_item_id: string | null;
	is_active: boolean;
	created_at: string;
}

export interface ProductImage {
	id: string;
	product_id: string;
	variant_id: string | null;
	file_path: string;
	file_size: number | null;
	mime_type: string | null;
	sort_order: number;
	is_primary: boolean;
	role: 'primary' | 'hover' | 'video' | null;
	uploaded_by: string | null;
	created_at: string;
}

export interface CommissionOverride {
	id: string;
	organization_id: string;
	brand_id: string;
	account_id: string;
	rate: number;
	created_at: string;
}

export interface MemberBrandCommission {
	id: string;
	organization_id: string;
	member_id: string;
	brand_id: string;
	rate: number;
	created_at: string;
}

export interface BrandAsset {
	id: string;
	brand_id: string;
	organization_id: string;
	name: string;
	file_path: string;
	file_size: number | null;
	mime_type: string | null;
	category: string;
	uploaded_by: string | null;
	created_at: string;
}

export interface EmailConnection {
	id: string;
	profile_id: string;
	provider: string;
	email_address: string;
	access_token: string;
	refresh_token: string;
	token_expires_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface DiscoveredContact {
	id: string;
	organization_id: string;
	email: string;
	name: string | null;
	status: 'new' | 'saved' | 'dismissed';
	first_seen_at: string;
	last_seen_at: string;
	message_count: number;
	discovered_by: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface EmailLog {
	id: string;
	organization_id: string;
	sent_by: string;
	to_email: string;
	subject: string;
	body: string | null;
	gmail_message_id: string | null;
	gmail_thread_id: string | null;
	related_type: string | null;
	related_id: string | null;
	created_at: string;
}

export interface IntegrationConnection {
	id: string;
	organization_id: string;
	provider: IntegrationProvider;
	status: 'active' | 'disconnected' | 'error';
	access_token: string;
	refresh_token: string | null;
	token_expires_at: string | null;
	scopes: string[];
	external_account_id: string | null;
	external_account_name: string | null;
	config: Record<string, unknown>;
	connected_by: string;
	created_at: string;
	updated_at: string;
}

export interface IntegrationSyncLog {
	id: string;
	organization_id: string;
	connection_id: string;
	action: string;
	status: 'success' | 'error' | 'pending';
	details: Record<string, unknown>;
	error_message: string | null;
	triggered_by: string | null;
	created_at: string;
}

export interface AccountUser {
	id: string;
	account_id: string;
	profile_id: string;
	role: string;
	invited_by: string | null;
	accepted_at: string | null;
	created_at: string;
	accounts?: Account & { organizations?: Organization };
	profiles?: Profile;
}

export interface AccountBrandAccess {
	id: string;
	account_id: string;
	brand_id: string;
	organization_id: string;
	granted_by: string | null;
	granted_at: string;
	brands?: Brand;
}

export interface Notification {
	id: string;
	organization_id: string;
	user_id: string;
	type: string;
	title: string;
	body: string | null;
	link: string | null;
	read_at: string | null;
	created_at: string;
}

export interface NotificationPreferences {
	id: string;
	user_id: string;
	organization_id: string;
	order_updates: boolean;
	comments: boolean;
	buyer_activity: boolean;
	team_activity: boolean;
	email_digest: boolean;
	created_at: string;
	updated_at: string;
}

export interface EmailTemplate {
	id: string;
	organization_id: string;
	name: string;
	subject: string;
	body: string;
	category: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface OrderComment {
	id: string;
	order_id: string;
	author_id: string;
	body: string;
	source_org_id: string | null;
	created_at: string;
	updated_at: string;
	profiles?: { display_name: string | null };
	source_org?: { id: string; name: string } | null;
}

export interface AccountTag {
	id: string;
	organization_id: string;
	name: string;
	color: string;
	sort_order: number;
	created_at: string;
}

export interface AccountTagAssignment {
	id: string;
	account_id: string;
	tag_id: string;
	assigned_by: string | null;
	created_at: string;
	account_tags?: AccountTag;
}

export interface OrganizationSsoProvider {
	id: string;
	organization_id: string;
	supabase_provider_id: string;
	domain: string;
	provider_type: string;
	display_name: string | null;
	metadata_url: string | null;
	created_at: string;
	updated_at: string;
	created_by: string | null;
}

export interface BrandExpense {
	id: string;
	organization_id: string;
	brand_id: string;
	expense_number: string;
	category: ExpenseCategory;
	description: string;
	amount: number;
	expense_date: string;
	status: ExpenseStatus;
	notes: string | null;
	submitted_by: string;
	reviewed_by: string | null;
	review_notes: string | null;
	submitted_at: string | null;
	approved_at: string | null;
	rejected_at: string | null;
	created_at: string;
	updated_at: string;
	brands?: Brand;
	profiles?: Profile;
}

export interface ExpenseReceipt {
	id: string;
	expense_id: string;
	organization_id: string;
	name: string;
	file_path: string;
	file_size: number | null;
	mime_type: string | null;
	uploaded_by: string | null;
	created_at: string;
}

export type AgentTriggerType = 'event' | 'schedule';

export interface OrgAgent {
	id: string;
	organization_id: string;
	name: string;
	slug: string;
	description: string | null;
	system_prompt: string;
	icon: string;
	is_active: boolean;
	created_by: string;
	created_at: string;
	updated_at: string;
	profiles?: Profile;
}

export interface OrgAgentTrigger {
	id: string;
	agent_id: string;
	organization_id: string;
	trigger_type: AgentTriggerType;
	event_name: string | null;
	cron_expression: string | null;
	trigger_prompt: string;
	notify_channel: string;
	is_active: boolean;
	last_run_at: string | null;
	created_at: string;
}

export interface OrgAgentRun {
	id: string;
	agent_id: string;
	organization_id: string;
	trigger_id: string | null;
	triggered_by: string;
	input_prompt: string;
	output_text: string | null;
	tools_used: string[] | null;
	status: string;
	error_message: string | null;
	started_at: string;
	completed_at: string | null;
	duration_ms: number | null;
}

export type ConnectionStatus = 'pending' | 'active' | 'suspended' | 'disconnected';

export interface OrgConnection {
	id: string;
	rep_org_id: string;
	brand_org_id: string;
	rep_brand_id: string | null;
	status: ConnectionStatus;
	commission_rate: number | null;
	connected_at: string | null;
	disconnected_at: string | null;
	requested_by: string | null;
	approved_by: string | null;
	created_at: string;
	updated_at: string;
	rep_org?: Organization;
	brand_org?: Organization;
}

export interface ConnectionInvite {
	id: string;
	brand_org_id: string;
	code: string;
	created_by: string;
	expires_at: string;
	max_uses: number;
	use_count: number;
	auto_approve: boolean;
	created_at: string;
}

export interface FederatedOrderLink {
	id: string;
	order_id: string;
	connection_id: string;
	source_org_id: string;
	target_org_id: string;
	status: 'active' | 'revoked';
	created_at: string;
}

export interface FederatedAccountLink {
	id: string;
	account_id: string;
	connection_id: string;
	source_org_id: string;
	target_org_id: string;
	created_at: string;
}

export interface BuyerInvitation {
	id: string;
	account_id: string;
	organization_id: string;
	email: string;
	token: string;
	invited_by: string;
	expires_at: string;
	accepted_at: string | null;
	created_at: string;
	accounts?: Account;
	organizations?: Organization;
}
