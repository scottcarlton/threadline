import type Anthropic from '@anthropic-ai/sdk';

export type FilePayload = { name: string; type: string; data: string };

// Anthropic accepts exactly these four image media types. The old code cast
// whatever the client sent straight into the media_type field, so an unsupported
// image (heic, svg) reached the API as a malformed request.
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Types we can honestly read as UTF-8 text. Binary office formats are excluded
// on purpose: decoding them as text produces mojibake, not content.
export const ALLOWED_TEXT_TYPES = new Set([
	'text/plain',
	'text/csv',
	'text/markdown',
	'text/tab-separated-values',
	'application/json'
]);

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // Anthropic's per-image ceiling
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
// Roughly the largest text that can fit the context window with room to answer.
export const MAX_TEXT_BYTES = 512 * 1024;

/** Decoded byte length of a base64 string, without allocating the buffer. */
export function base64ByteLength(data: string): number {
	const clean = data.replace(/[\r\n]/g, '');
	if (clean.length === 0) return 0;
	const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
	return Math.floor((clean.length * 3) / 4) - padding;
}

export type AttachmentResult =
	| { ok: true; blocks: Anthropic.ContentBlockParam[] }
	| { ok: false; error: string };

/**
 * Validate and convert client attachments into content blocks.
 *
 * Previously this ran unchecked: any non-image file was base64-decoded and
 * inlined into the prompt whole, with no size cap, no count cap, and no type
 * allowlist. Compare parse-linesheet, which has capped uploads since day one.
 */
export function buildAttachmentBlocks(files: unknown): AttachmentResult {
	if (!Array.isArray(files)) return { ok: true, blocks: [] };
	if (files.length === 0) return { ok: true, blocks: [] };

	if (files.length > MAX_FILES) {
		return { ok: false, error: `Too many files. Attach up to ${MAX_FILES} at a time.` };
	}

	const blocks: Anthropic.ContentBlockParam[] = [];
	let totalBytes = 0;

	for (const raw of files) {
		const file = raw as Partial<FilePayload>;
		if (typeof file?.data !== 'string' || typeof file?.type !== 'string') {
			return { ok: false, error: 'Attachment is missing its type or contents.' };
		}

		const name = typeof file.name === 'string' ? file.name : 'attachment';
		const bytes = base64ByteLength(file.data);
		totalBytes += bytes;

		if (bytes > MAX_FILE_BYTES) {
			return { ok: false, error: `"${name}" is too large. Maximum size is 5MB per file.` };
		}
		if (totalBytes > MAX_TOTAL_BYTES) {
			return { ok: false, error: 'Those files are too large together. Maximum is 15MB total.' };
		}

		if (file.type.startsWith('image/')) {
			if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
				return {
					ok: false,
					error: `"${name}" is not a supported image. Use JPEG, PNG, GIF, or WebP.`
				};
			}
			blocks.push({
				type: 'image',
				source: {
					type: 'base64',
					media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
					data: file.data
				}
			});
			continue;
		}

		if (!ALLOWED_TEXT_TYPES.has(file.type)) {
			return {
				ok: false,
				error: `"${name}" is not a supported file type. Attach an image, or a CSV, TXT, JSON, or Markdown file.`
			};
		}
		if (bytes > MAX_TEXT_BYTES) {
			return { ok: false, error: `"${name}" has too much text to read at once. Maximum is 512KB.` };
		}

		blocks.push({
			type: 'text',
			text: `[Attached file: ${name}]\n${Buffer.from(file.data, 'base64').toString('utf-8')}`
		});
	}

	return { ok: true, blocks };
}
