import { orderGrandTotal, orderShippingCost } from '$lib/utils/order-total';
import { createPdfCanvas, drawLineItemTable, drawTotalRow, type TableLine } from './pdf-layout.js';

export interface OrderData {
	order_number: string;
	total_amount: number;
	shipping_cost?: number | string | null;
	status: string;
	notes: string | null;
	created_at: string;
	brands?: { name: string } | null;
	accounts?: {
		business_name: string;
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
	} | null;
	seasons?: { name: string } | null;
	shows?: { name: string } | null;
}

type LineData = TableLine;

export async function generateOrderPdf(order: OrderData, lines: LineData[]): Promise<Uint8Array> {
	const c = await createPdfCanvas();
	const { gray } = c.colors;

	// --- Header ---
	c.text(order.brands?.name ?? 'Order', c.margin, c.y, { font: c.bold, size: 22 });
	c.y -= 24;

	c.text(`Order #${order.order_number}`, c.margin, c.y, { font: c.bold, size: 14 });

	const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	c.rightText(orderDate, c.y, { size: 11, color: gray });
	c.y -= 16;

	const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
	c.text(`Status: ${statusLabel}`, c.margin, c.y, { size: 10, color: gray });

	if (order.seasons?.name) {
		c.rightText(`Season: ${order.seasons.name}`, c.y, { size: 10, color: gray });
	}
	c.y -= 10;

	c.divider();

	// --- Account section ---
	const account = order.accounts;
	if (account) {
		c.text('BILL TO', c.margin, c.y, { font: c.bold, size: 9, color: gray });
		c.y -= 16;

		c.text(account.business_name, c.margin, c.y, { font: c.bold, size: 12 });
		c.y -= 15;

		const contactFullName = [account.contact_first_name, account.contact_last_name]
			.filter(Boolean)
			.join(' ');
		if (contactFullName) {
			c.text(contactFullName, c.margin, c.y, { size: 10 });
			c.y -= 13;
		}
		if (account.contact_email) {
			c.text(account.contact_email, c.margin, c.y, { size: 10, color: gray });
			c.y -= 13;
		}
		if (account.phone) {
			c.text(account.phone, c.margin, c.y, { size: 10, color: gray });
			c.y -= 13;
		}

		const addressParts: string[] = [];
		if (account.address_line1) addressParts.push(account.address_line1);
		if (account.address_line2) addressParts.push(account.address_line2);
		const cityStateZip =
			[account.city, account.state].filter(Boolean).join(', ') +
			(account.zip ? ' ' + account.zip : '');
		if (cityStateZip.trim()) addressParts.push(cityStateZip);

		for (const line of addressParts) {
			c.text(line, c.margin, c.y, { size: 10 });
			c.y -= 13;
		}

		c.y -= 10;
	}

	// --- Line items ---
	drawLineItemTable(c, lines);

	c.divider();

	// --- Total ---
	c.ensureSpace(40);

	// Break out merchandise and shipping whenever freight is priced. A single
	// "Order Total" that quietly folds in shipping is not a document a buyer can
	// reconcile against the line items printed directly above it.
	const shipping = orderShippingCost(order);
	if (shipping !== null) {
		c.ensureSpace(70);
		drawTotalRow(c, 'Merchandise:', Number(order.total_amount));
		drawTotalRow(c, 'Shipping:', shipping);
		c.y -= 4;
	}

	drawTotalRow(c, 'Order Total:', orderGrandTotal(order), { emphasis: true });

	// --- Notes ---
	if (order.notes) {
		c.ensureSpace(50);
		c.text('Notes:', c.margin, c.y, { font: c.bold, size: 10 });
		c.y -= 14;

		for (const noteLine of order.notes.split('\n')) {
			c.ensureSpace(16);
			c.text(c.truncate(noteLine, c.contentWidth - 10, c.regular, 9), c.margin, c.y, {
				size: 9,
				color: gray
			});
			c.y -= 13;
		}
	}

	return c.save();
}
