import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'a',
	'ul',
	'ol',
	'li',
	'b',
	'i',
	'strong',
	'em',
	's',
	'del',
	'code',
	'pre',
	'blockquote',
	'br',
	'hr',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
];

const ALLOWED_ATTR = ['href', 'title'];

export function sanitizeMarkdown(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):)/i
	});
}
