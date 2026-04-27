import sanitizeHtml from 'sanitize-html';

export function sanitizeMarkdown(html: string): string {
	return sanitizeHtml(html, {
		allowedTags: [
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
		],
		allowedAttributes: {
			a: ['href', 'title']
		},
		allowedSchemes: ['http', 'https', 'mailto', 'tel']
	});
}
