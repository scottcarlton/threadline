// Website fields are stored protocol-less (`yourbrand.com`) so the input is
// less fussy. Inputs accept either form; rendered links are re-prefixed with
// `https://` at render time via `withProtocol`.

const PROTOCOL_PREFIX = /^(https?:)?\/\//i;
const TRAILING_SLASH = /\/+$/;
// A loose hostname check — rejects clearly invalid input but doesn't require
// TLD whitelisting. We're guarding against typos, not validating registrability.
const HOSTNAME = /^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i;

export function stripProtocol(url: string | null | undefined): string {
	if (!url) return '';
	return url.trim().replace(PROTOCOL_PREFIX, '').replace(TRAILING_SLASH, '');
}

export function withProtocol(url: string | null | undefined): string {
	const clean = stripProtocol(url);
	return clean ? `https://${clean}` : '';
}

export function isValidWebsite(url: string | null | undefined): boolean {
	const clean = stripProtocol(url);
	if (!clean) return false;
	return HOSTNAME.test(clean);
}
