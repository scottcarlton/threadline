import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface OrderData {
	order_number: string;
	total_amount: number;
	notes: string | null;
	created_at: string;
	status: string;
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

interface LineData {
	style_number: string | null;
	description: string | null;
	color: string | null;
	size: string | null;
	qty: number;
	unit_price: number;
	line_total: number;
}

export async function generateOrderPdf(
	order: OrderData,
	lines: LineData[]
): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const helvetica = await doc.embedFont(StandardFonts.Helvetica);
	const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

	const pageWidth = 612;
	const pageHeight = 792;
	const margin = 50;
	const contentWidth = pageWidth - margin * 2;

	let page = doc.addPage([pageWidth, pageHeight]);
	let y = pageHeight - margin;

	const black = rgb(0, 0, 0);
	const gray = rgb(0.4, 0.4, 0.4);
	const lightGray = rgb(0.9, 0.9, 0.9);
	const headerBg = rgb(0.15, 0.15, 0.15);
	const white = rgb(1, 1, 1);

	function drawText(
		text: string,
		x: number,
		yPos: number,
		options: { font?: typeof helvetica; size?: number; color?: typeof black } = {}
	) {
		const font = options.font ?? helvetica;
		const size = options.size ?? 10;
		const color = options.color ?? black;
		page.drawText(text, { x, y: yPos, size, font, color });
	}

	function truncate(text: string, maxWidth: number, font: typeof helvetica, size: number): string {
		if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
		let t = text;
		while (t.length > 0 && font.widthOfTextAtSize(t + '...', size) > maxWidth) {
			t = t.slice(0, -1);
		}
		return t + '...';
	}

	function ensureSpace(needed: number): void {
		if (y - needed < margin) {
			page = doc.addPage([pageWidth, pageHeight]);
			y = pageHeight - margin;
		}
	}

	// --- Header ---
	const brandName = order.brands?.name ?? 'Order';
	drawText(brandName, margin, y, { font: helveticaBold, size: 22 });
	y -= 24;

	drawText(`Order #${order.order_number}`, margin, y, { font: helveticaBold, size: 14 });

	const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	const dateWidth = helvetica.widthOfTextAtSize(orderDate, 11);
	drawText(orderDate, pageWidth - margin - dateWidth, y, { size: 11, color: gray });
	y -= 16;

	const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
	drawText(`Status: ${statusLabel}`, margin, y, { size: 10, color: gray });

	if (order.seasons?.name) {
		const seasonText = `Season: ${order.seasons.name}`;
		const sw = helvetica.widthOfTextAtSize(seasonText, 10);
		drawText(seasonText, pageWidth - margin - sw, y, { size: 10, color: gray });
	}
	y -= 10;

	// Divider
	page.drawRectangle({ x: margin, y: y - 1, width: contentWidth, height: 1, color: lightGray });
	y -= 20;

	// --- Account section ---
	const account = order.accounts;
	if (account) {
		drawText('BILL TO', margin, y, { font: helveticaBold, size: 9, color: gray });
		y -= 16;

		drawText(account.business_name, margin, y, { font: helveticaBold, size: 12 });
		y -= 15;

		const contactFullName = [account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ');
		if (contactFullName) {
			drawText(contactFullName, margin, y, { size: 10 });
			y -= 13;
		}
		if (account.contact_email) {
			drawText(account.contact_email, margin, y, { size: 10, color: gray });
			y -= 13;
		}
		if (account.phone) {
			drawText(account.phone, margin, y, { size: 10, color: gray });
			y -= 13;
		}

		const addressParts: string[] = [];
		if (account.address_line1) addressParts.push(account.address_line1);
		if (account.address_line2) addressParts.push(account.address_line2);
		const cityStateZip = [account.city, account.state].filter(Boolean).join(', ') +
			(account.zip ? ' ' + account.zip : '');
		if (cityStateZip.trim()) addressParts.push(cityStateZip);

		for (const line of addressParts) {
			drawText(line, margin, y, { size: 10 });
			y -= 13;
		}

		y -= 10;
	}

	// --- Line items table ---
	const columns = [
		{ label: 'Style #', width: 70, key: 'style_number' as const },
		{ label: 'Description', width: 140, key: 'description' as const },
		{ label: 'Color', width: 70, key: 'color' as const },
		{ label: 'Size', width: 45, key: 'size' as const },
		{ label: 'Qty', width: 40, key: 'qty' as const, align: 'right' as const },
		{ label: 'Unit Price', width: 65, key: 'unit_price' as const, align: 'right' as const },
		{ label: 'Total', width: 65, key: 'line_total' as const, align: 'right' as const }
	];

	// Adjust description to fill remaining space
	const fixedWidth = columns.reduce((sum, c) => sum + (c.key !== 'description' ? c.width : 0), 0);
	const descCol = columns.find((c) => c.key === 'description')!;
	descCol.width = contentWidth - fixedWidth - (columns.length - 1) * 5;

	const colGap = 5;
	const rowHeight = 18;
	const headerHeight = 22;

	ensureSpace(headerHeight + rowHeight * Math.min(lines.length, 3) + 60);

	// Table header
	page.drawRectangle({ x: margin, y: y - headerHeight + 4, width: contentWidth, height: headerHeight, color: headerBg });

	let colX = margin + 5;
	for (const col of columns) {
		const align = 'align' in col ? col.align : undefined;
		const textX = align === 'right' ? colX + col.width - helveticaBold.widthOfTextAtSize(col.label, 8) - 5 : colX;
		drawText(col.label, textX, y - headerHeight + 11, { font: helveticaBold, size: 8, color: white });
		colX += col.width + colGap;
	}
	y -= headerHeight + 2;

	// Table rows
	for (let i = 0; i < lines.length; i++) {
		ensureSpace(rowHeight + 40);

		const line = lines[i];

		if (i % 2 === 1) {
			page.drawRectangle({ x: margin, y: y - rowHeight + 6, width: contentWidth, height: rowHeight, color: lightGray });
		}

		colX = margin + 5;
		for (const col of columns) {
			let value: string;
			if (col.key === 'qty') {
				value = String(line.qty);
			} else if (col.key === 'unit_price') {
				value = '$' + Number(line.unit_price).toFixed(2);
			} else if (col.key === 'line_total') {
				value = '$' + Number(line.line_total).toFixed(2);
			} else {
				value = (line[col.key] as string) ?? '';
			}

			const maxW = col.width - 10;
			const display = truncate(value, maxW, helvetica, 9);
			const align = 'align' in col ? col.align : undefined;
			const textX = align === 'right' ? colX + col.width - helvetica.widthOfTextAtSize(display, 9) - 5 : colX;
			drawText(display, textX, y - rowHeight + 10, { size: 9 });
			colX += col.width + colGap;
		}

		y -= rowHeight;
	}

	y -= 6;

	// Divider
	page.drawRectangle({ x: margin, y: y - 1, width: contentWidth, height: 1, color: lightGray });
	y -= 20;

	// --- Total ---
	ensureSpace(40);
	const totalStr = '$' + Number(order.total_amount).toFixed(2);
	const totalLabelX = pageWidth - margin - 150;
	drawText('Order Total:', totalLabelX, y, { font: helveticaBold, size: 12 });
	const totalValWidth = helveticaBold.widthOfTextAtSize(totalStr, 12);
	drawText(totalStr, pageWidth - margin - totalValWidth, y, { font: helveticaBold, size: 12 });
	y -= 30;

	// --- Notes ---
	if (order.notes) {
		ensureSpace(50);
		drawText('Notes:', margin, y, { font: helveticaBold, size: 10 });
		y -= 14;

		const noteLines = order.notes.split('\n');
		for (const noteLine of noteLines) {
			ensureSpace(16);
			const display = truncate(noteLine, contentWidth - 10, helvetica, 9);
			drawText(display, margin, y, { size: 9, color: gray });
			y -= 13;
		}
	}

	return doc.save();
}
