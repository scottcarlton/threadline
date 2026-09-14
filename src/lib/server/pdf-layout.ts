/**
 * Shared layout primitives for the documents Threadline renders as PDFs.
 *
 * These were private closures inside `pdf.ts`, which was fine while the order
 * confirmation was the only document. An invoice needs the same page setup,
 * the same type scale, the same line-item table and the same pagination, and
 * two independent copies of that would drift into two documents that look like
 * they came from different companies.
 *
 * The canvas owns the mutable bits the closures used to capture -- the current
 * page and the vertical cursor -- so callers keep reading top-down:
 *
 *   const c = await createPdfCanvas();
 *   c.text('Invoice', c.margin, c.y, { font: c.bold, size: 22 });
 *   c.y -= 24;
 *
 * Nothing here knows what an order or an invoice is. Document-specific
 * composition stays in `pdf.ts` and `invoice-pdf.ts`.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type TextOptions = {
	font?: PDFFont;
	size?: number;
	color?: ReturnType<typeof rgb>;
};

/** A line item, in the shape both documents' tables render. */
export type TableLine = {
	style_number: string | null;
	description: string | null;
	color: string | null;
	size: string | null;
	qty: number;
	unit_price: number | string;
	line_total: number | string;
};

export type PdfCanvas = {
	readonly doc: PDFDocument;
	readonly regular: PDFFont;
	readonly bold: PDFFont;
	readonly pageWidth: number;
	readonly pageHeight: number;
	readonly margin: number;
	readonly contentWidth: number;
	readonly colors: {
		black: ReturnType<typeof rgb>;
		gray: ReturnType<typeof rgb>;
		lightGray: ReturnType<typeof rgb>;
		headerBg: ReturnType<typeof rgb>;
		white: ReturnType<typeof rgb>;
	};
	/** Vertical cursor, measured from the bottom of the page as pdf-lib does. */
	y: number;
	text(text: string, x: number, yPos: number, options?: TextOptions): void;
	/** Draws right-aligned against the content edge. Returns the text width. */
	rightText(text: string, yPos: number, options?: TextOptions): number;
	truncate(text: string, maxWidth: number, font: PDFFont, size: number): string;
	/** Starts a new page when `needed` points would overflow the bottom margin. */
	ensureSpace(needed: number): void;
	rect(x: number, yPos: number, width: number, height: number, color: ReturnType<typeof rgb>): void;
	/** Hairline rule across the content width, and advances past it. */
	divider(gapBelow?: number): void;
	save(): Promise<Uint8Array>;
};

export async function createPdfCanvas(): Promise<PdfCanvas> {
	const doc = await PDFDocument.create();
	const regular = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	const pageWidth = 612;
	const pageHeight = 792;
	const margin = 50;
	const contentWidth = pageWidth - margin * 2;

	const colors = {
		black: rgb(0, 0, 0),
		gray: rgb(0.4, 0.4, 0.4),
		lightGray: rgb(0.9, 0.9, 0.9),
		headerBg: rgb(0.15, 0.15, 0.15),
		white: rgb(1, 1, 1)
	};

	let page: PDFPage = doc.addPage([pageWidth, pageHeight]);

	const canvas: PdfCanvas = {
		doc,
		regular,
		bold,
		pageWidth,
		pageHeight,
		margin,
		contentWidth,
		colors,
		y: pageHeight - margin,

		text(text, x, yPos, options = {}) {
			page.drawText(text, {
				x,
				y: yPos,
				size: options.size ?? 10,
				font: options.font ?? regular,
				color: options.color ?? colors.black
			});
		},

		rightText(text, yPos, options = {}) {
			const font = options.font ?? regular;
			const size = options.size ?? 10;
			const width = font.widthOfTextAtSize(text, size);
			canvas.text(text, pageWidth - margin - width, yPos, options);
			return width;
		},

		truncate(text, maxWidth, font, size) {
			if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
			let t = text;
			while (t.length > 0 && font.widthOfTextAtSize(t + '...', size) > maxWidth) {
				t = t.slice(0, -1);
			}
			return t + '...';
		},

		ensureSpace(needed) {
			if (canvas.y - needed < margin) {
				page = doc.addPage([pageWidth, pageHeight]);
				canvas.y = pageHeight - margin;
			}
		},

		rect(x, yPos, width, height, color) {
			page.drawRectangle({ x, y: yPos, width, height, color });
		},

		divider(gapBelow = 20) {
			canvas.rect(margin, canvas.y - 1, contentWidth, 1, colors.lightGray);
			canvas.y -= gapBelow;
		},

		save() {
			return doc.save();
		}
	};

	return canvas;
}

/**
 * The line-item table, identical on every document so a buyer comparing an
 * order confirmation against its invoice is reading the same object twice.
 *
 * Paginates itself and leaves the cursor below the last row.
 */
export function drawLineItemTable(c: PdfCanvas, lines: TableLine[]): void {
	const columns = [
		{ label: 'Style #', width: 70, key: 'style_number' as const },
		{ label: 'Description', width: 140, key: 'description' as const },
		{ label: 'Color', width: 70, key: 'color' as const },
		{ label: 'Size', width: 45, key: 'size' as const },
		{ label: 'Qty', width: 40, key: 'qty' as const, align: 'right' as const },
		{ label: 'Unit Price', width: 65, key: 'unit_price' as const, align: 'right' as const },
		{ label: 'Total', width: 65, key: 'line_total' as const, align: 'right' as const }
	];

	// Description absorbs whatever the fixed columns leave over.
	const fixedWidth = columns.reduce(
		(sum, col) => sum + (col.key !== 'description' ? col.width : 0),
		0
	);
	const descCol = columns.find((col) => col.key === 'description')!;
	descCol.width = c.contentWidth - fixedWidth - (columns.length - 1) * 5;

	const colGap = 5;
	const rowHeight = 18;
	const headerHeight = 22;

	c.ensureSpace(headerHeight + rowHeight * Math.min(lines.length, 3) + 60);

	c.rect(c.margin, c.y - headerHeight + 4, c.contentWidth, headerHeight, c.colors.headerBg);

	let colX = c.margin + 5;
	for (const col of columns) {
		const align = 'align' in col ? col.align : undefined;
		const textX =
			align === 'right' ? colX + col.width - c.bold.widthOfTextAtSize(col.label, 8) - 5 : colX;
		c.text(col.label, textX, c.y - headerHeight + 11, {
			font: c.bold,
			size: 8,
			color: c.colors.white
		});
		colX += col.width + colGap;
	}
	c.y -= headerHeight + 2;

	for (let i = 0; i < lines.length; i++) {
		c.ensureSpace(rowHeight + 40);
		const line = lines[i];

		if (i % 2 === 1) {
			c.rect(c.margin, c.y - rowHeight + 6, c.contentWidth, rowHeight, c.colors.lightGray);
		}

		colX = c.margin + 5;
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

			const display = c.truncate(value, col.width - 10, c.regular, 9);
			const align = 'align' in col ? col.align : undefined;
			const textX =
				align === 'right' ? colX + col.width - c.regular.widthOfTextAtSize(display, 9) - 5 : colX;
			c.text(display, textX, c.y - rowHeight + 10, { size: 9 });
			colX += col.width + colGap;
		}

		c.y -= rowHeight;
	}

	c.y -= 6;
}

/**
 * A right-aligned money row in a totals block: muted label and figure, or
 * bold when it is the line the reader is looking for.
 */
export function drawTotalRow(
	c: PdfCanvas,
	label: string,
	amount: number,
	options: { emphasis?: boolean } = {}
): void {
	const emphasis = options.emphasis ?? false;
	const size = emphasis ? 12 : 10;
	const font = emphasis ? c.bold : c.regular;
	const color = emphasis ? c.colors.black : c.colors.gray;

	c.text(label, c.pageWidth - c.margin - 150, c.y, { font, size, color });
	c.rightText('$' + amount.toFixed(2), c.y, { font, size, color });
	c.y -= emphasis ? 30 : 16;
}
