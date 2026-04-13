import type { OrderType, OrderStatus } from '$lib/types/database.js';

export type CartLine = {
	product_id: string | null;
	brand_id: string;
	season_id: string;
	style_number: string | null;
	description: string | null;
	color: string | null;
	size: string | null;
	qty: number;
	unit_price: number;
};

export type DeliveryChoice =
	| { kind: 'delivery'; delivery_id: string }
	| { kind: 'custom'; expected_ship_date: string };

export type OrderGroup = {
	brand_id: string;
	season_id: string;
	lines: CartLine[];
	total: number;
	delivery: DeliveryChoice | null;
	location_id: string | null;
};

export type CartContext = {
	type: OrderType;
	account_id: string | null;
	freeform_name: string | null;
	order_year: number | null;
};

export type NewOrder = {
	order_type: OrderType;
	account_id: string | null;
	freeform_name: string | null;
	location_id: string | null;
	brand_id: string;
	season_id: string;
	order_year: number | null;
	delivery_id: string | null;
	expected_ship_date: string | null;
	status: OrderStatus;
	total_amount: number;
	lines: Array<Omit<CartLine, 'brand_id' | 'season_id'>>;
};

function groupKey(line: CartLine): string {
	return `${line.brand_id}::${line.season_id}`;
}

/**
 * Group cart lines into one OrderGroup per (brand, season) pair.
 * Order of returned groups follows first-appearance of each key in `lines`.
 */
export function groupCart(lines: CartLine[]): OrderGroup[] {
	const map = new Map<string, OrderGroup>();
	for (const line of lines) {
		if (line.qty <= 0) continue;
		const key = groupKey(line);
		let group = map.get(key);
		if (!group) {
			group = {
				brand_id: line.brand_id,
				season_id: line.season_id,
				lines: [],
				total: 0,
				delivery: null,
				location_id: null
			};
			map.set(key, group);
		}
		group.lines.push(line);
		group.total += line.qty * line.unit_price;
	}
	return [...map.values()];
}

/**
 * Build the NewOrder rows that will be inserted on submit.
 *
 * Rules:
 * - One NewOrder per (brand, season) group.
 * - Notes (`type === 'note'`) require ≥1 line — caller should validate before calling.
 * - Freeform (account_id is null) forces every order to status 'draft'; otherwise inherits `submitStatus`.
 */
export function buildOrders(
	groups: OrderGroup[],
	ctx: CartContext,
	submitStatus: OrderStatus = 'draft'
): NewOrder[] {
	const isFreeform = ctx.account_id === null;
	const status: OrderStatus = isFreeform ? 'draft' : submitStatus;

	return groups.map((group) => ({
		order_type: ctx.type,
		account_id: ctx.account_id,
		freeform_name: ctx.freeform_name,
		location_id: group.location_id,
		brand_id: group.brand_id,
		season_id: group.season_id,
		order_year: ctx.order_year,
		delivery_id: group.delivery?.kind === 'delivery' ? group.delivery.delivery_id : null,
		expected_ship_date:
			group.delivery?.kind === 'custom' ? group.delivery.expected_ship_date : null,
		status,
		total_amount: group.total,
		lines: group.lines.map((l) => ({
			product_id: l.product_id,
			style_number: l.style_number,
			description: l.description,
			color: l.color,
			size: l.size,
			qty: l.qty,
			unit_price: l.unit_price
		}))
	}));
}

export class CartValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CartValidationError';
	}
}

/**
 * Validates the cart against business rules. Throws CartValidationError on failure.
 *
 * - Both order and note types require at least one line item.
 * - Either an account_id or a freeform_name must be set.
 * - Freeform orders cannot submit past draft (caller must use submitStatus='draft').
 */
export function validateCart(
	groups: OrderGroup[],
	ctx: CartContext,
	submitStatus: OrderStatus
): void {
	const totalLines = groups.reduce((n, g) => n + g.lines.length, 0);
	if (totalLines < 1) {
		throw new CartValidationError(
			ctx.type === 'note' ? 'A note needs at least one item.' : 'An order needs at least one item.'
		);
	}

	if (ctx.account_id === null && !ctx.freeform_name) {
		throw new CartValidationError('Pick an account or enter a freeform name.');
	}

	if (ctx.account_id === null && submitStatus !== 'draft') {
		throw new CartValidationError(
			'Freeform orders must stay as drafts until the account details are filled in.'
		);
	}
}
