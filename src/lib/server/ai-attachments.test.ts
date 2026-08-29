import { describe, it, expect } from 'vitest';
import {
	buildAttachmentBlocks,
	base64ByteLength,
	MAX_FILES,
	MAX_FILE_BYTES,
	MAX_PDF_BYTES,
	MAX_TOTAL_BYTES,
	MAX_TEXT_BYTES
} from './ai-attachments.js';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const b64OfSize = (bytes: number) => Buffer.alloc(bytes, 0x61).toString('base64');

describe('base64ByteLength', () => {
	it('returns 0 for an empty string', () => {
		expect(base64ByteLength('')).toBe(0);
	});

	it('matches the real decoded length, including padded inputs', () => {
		for (const s of ['a', 'ab', 'abc', 'abcd', 'hello world']) {
			expect(base64ByteLength(b64(s))).toBe(Buffer.from(s).length);
		}
	});

	it('ignores line breaks in wrapped base64', () => {
		const raw = b64('hello world');
		const wrapped = raw.slice(0, 4) + '\n' + raw.slice(4);
		expect(base64ByteLength(wrapped)).toBe(11);
	});
});

describe('buildAttachmentBlocks', () => {
	it('returns no blocks when there are no files', () => {
		expect(buildAttachmentBlocks(undefined)).toEqual({ ok: true, blocks: [] });
		expect(buildAttachmentBlocks([])).toEqual({ ok: true, blocks: [] });
	});

	it('passes through a supported image', () => {
		const result = buildAttachmentBlocks([{ name: 'a.png', type: 'image/png', data: b64('x') }]);
		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.blocks[0]).toMatchObject({ type: 'image' });
	});

	it('rejects an image type Anthropic does not accept', () => {
		const result = buildAttachmentBlocks([{ name: 'a.heic', type: 'image/heic', data: b64('x') }]);
		expect(result).toMatchObject({ ok: false });
	});

	// File contents are authored by whoever made the file, not by the person
	// asking, so they arrive fenced as untrusted rather than inlined bare.
	it('inlines a text file fenced as untrusted, named', () => {
		const result = buildAttachmentBlocks([
			{ name: 'notes.txt', type: 'text/plain', data: b64('ship window is march') }
		]);
		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		const block = result.blocks[0] as { type: string; text: string };
		expect(block.type).toBe('text');
		expect(block.text).toContain('ship window is march');
		expect(block.text).toContain('source="uploaded file"');
		expect(block.text).toContain('name="notes.txt"');
		expect(block.text).toMatch(/^<untrusted-content /);
	});

	// A PDF used to be utf-8 decoded into mojibake. It now goes as a document
	// block, the same way parse-linesheet sends line sheets.
	it('sends a PDF as a document block, not decoded text', () => {
		const result = buildAttachmentBlocks([
			{ name: 'linesheet.pdf', type: 'application/pdf', data: b64('%PDF-1.7') }
		]);
		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.blocks[0]).toMatchObject({
			type: 'document',
			source: { type: 'base64', media_type: 'application/pdf' }
		});
	});

	it('allows a PDF above the image ceiling but below the PDF ceiling', () => {
		const result = buildAttachmentBlocks([
			{ name: 'big.pdf', type: 'application/pdf', data: b64OfSize(MAX_FILE_BYTES + 1024) }
		]);
		expect(result).toMatchObject({ ok: true });
	});

	it('rejects a PDF over the PDF ceiling', () => {
		const result = buildAttachmentBlocks([
			{ name: 'huge.pdf', type: 'application/pdf', data: b64OfSize(MAX_PDF_BYTES + 1024) }
		]);
		expect(result).toMatchObject({ ok: false });
	});

	// Still rejected: unlike PDF, there is no honest way to send these.
	it('rejects a binary office format instead of inlining mojibake', () => {
		const result = buildAttachmentBlocks([
			{ name: 'sheet.xlsx', type: 'application/vnd.ms-excel', data: b64('PK') }
		]);
		expect(result).toMatchObject({ ok: false });
	});

	it('rejects more than the file count cap', () => {
		const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({
			name: `${i}.txt`,
			type: 'text/plain',
			data: b64('x')
		}));
		expect(buildAttachmentBlocks(files)).toMatchObject({ ok: false });
	});

	it('rejects a single oversized file', () => {
		const result = buildAttachmentBlocks([
			{ name: 'big.png', type: 'image/png', data: b64OfSize(MAX_FILE_BYTES + 1024) }
		]);
		expect(result).toMatchObject({ ok: false });
	});

	it('rejects text over the text ceiling even when under the byte ceiling', () => {
		const result = buildAttachmentBlocks([
			{ name: 'huge.csv', type: 'text/csv', data: b64OfSize(MAX_TEXT_BYTES + 1024) }
		]);
		expect(result).toMatchObject({ ok: false });
		expect(MAX_TEXT_BYTES).toBeLessThan(MAX_FILE_BYTES);
	});

	it('rejects a payload that is only oversized in aggregate', () => {
		const files = Array.from({ length: 2 }, () => ({
			name: 'big.pdf',
			type: 'application/pdf',
			data: b64OfSize(MAX_PDF_BYTES - 1024)
		}));
		expect(buildAttachmentBlocks(files)).toMatchObject({ ok: false });
		expect(MAX_TOTAL_BYTES).toBeLessThan((MAX_PDF_BYTES - 1024) * 2);
	});

	it('rejects a malformed attachment', () => {
		expect(buildAttachmentBlocks([{ name: 'x' }])).toMatchObject({ ok: false });
	});
});
