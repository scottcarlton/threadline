import DOMPurify from 'dompurify';

// Email bodies are far richer than chat markdown — they use tables for layout,
// inline styles, images, and font tags. Allow that subset while still stripping
// scripts, event handlers, iframes, forms, etc.
const ALLOWED_TAGS = [
	'a',
	'b',
	'i',
	'u',
	's',
	'em',
	'strong',
	'small',
	'sub',
	'sup',
	'p',
	'br',
	'hr',
	'span',
	'div',
	'blockquote',
	'pre',
	'code',
	'ul',
	'ol',
	'li',
	'dl',
	'dt',
	'dd',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'td',
	'th',
	'caption',
	'col',
	'colgroup',
	'img',
	'figure',
	'figcaption',
	'center',
	'font'
];

const ALLOWED_ATTR = [
	'href',
	'title',
	'target',
	'rel',
	'src',
	'alt',
	'width',
	'height',
	'align',
	'valign',
	'bgcolor',
	'color',
	'face',
	'size',
	'style',
	'colspan',
	'rowspan',
	'cellpadding',
	'cellspacing',
	'border',
	'dir',
	'lang'
];

// http(s)/mailto/tel for links, plus inline data:image for embedded images.
const ALLOWED_URI_REGEXP =
	/^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);)/i;

let hookAdded = false;
function ensureHook() {
	if (hookAdded || typeof window === 'undefined') return;
	// Force every link to open in a new tab and never leak the opener / referrer.
	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		if (node.tagName === 'A' && node.getAttribute('href')) {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer nofollow');
		}
		if (node.tagName === 'IMG') {
			node.setAttribute('loading', 'lazy');
		}
	});
	hookAdded = true;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Sanitize a raw HTML email body for safe rendering with {@html}. */
export function sanitizeEmailHtml(html: string): string {
	// DOMPurify needs a DOM; on the server return nothing — the body renders
	// client-side once the thread is fetched, so this is never user-visible.
	if (typeof window === 'undefined') return '';
	ensureHook();
	return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP });
}

/**
 * Render an email body for display. HTML bodies are sanitized; plain-text
 * bodies are escaped and wrapped so their whitespace and line breaks survive.
 */
export function renderEmailBody(content: string, isHtml: boolean): string {
	if (!content) return '';
	if (isHtml) return sanitizeEmailHtml(content);
	return `<div style="white-space:pre-wrap">${escapeHtml(content)}</div>`;
}
