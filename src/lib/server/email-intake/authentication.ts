/**
 * Sender authentication for inbound email orders.
 *
 * The intake pipeline identified the sending organization from the `From`
 * header alone (see route.ts). Nothing verified that the sender was actually
 * who they claimed. The Brevo webhook's bearer token authenticates *Brevo* as
 * the deliverer, not the human as the author, so anyone who knew a rep's email
 * address could send a spoofed message and, on a clean parse, have an order
 * auto-submitted into that rep's org with no human review.
 *
 * Brevo does not hand us a normalised verdict. It passes the raw headers
 * through, so we read `Authentication-Results` (and `Received-SPF` as a
 * fallback) and decide for ourselves.
 * https://developers.brevo.com/docs/inbound-parse-webhooks
 *
 * ## Why only the topmost header
 *
 * `Authentication-Results` is trivially forgeable: an attacker can put
 * `Authentication-Results: dmarc=pass` in the message they send, and it arrives
 * in the header block like any other line. What makes the header trustworthy is
 * *who added it*. Each MTA prepends its own at the top, so the first occurrence
 * is the one written by the receiving infrastructure and everything below it is
 * hearsay from earlier hops or from the sender.
 *
 * So: when a header arrives as an array we read index 0 and ignore the rest.
 * A forged copy further down cannot promote itself.
 *
 * ## Fail closed
 *
 * No headers, no parseable verdict, or a verdict that does not align with the
 * From domain all evaluate to unauthenticated. The caller downgrades those to
 * human review rather than rejecting them, so a misconfigured but legitimate
 * sender still gets their order looked at instead of silently dropped.
 */

export type HeaderValue = string | string[];
export type EmailHeaders = Record<string, HeaderValue>;

export type AuthMethodResult = 'pass' | 'fail' | 'none';

export type SenderAuthDetails = {
	spf: AuthMethodResult;
	dkim: AuthMethodResult;
	dmarc: AuthMethodResult;
	/** `header.d=` from the DKIM signature, when present. */
	dkimDomain: string | null;
	/** `smtp.mailfrom=` from the SPF result, when present. */
	spfDomain: string | null;
};

export type SenderAuthVerdict = {
	authenticated: boolean;
	/** One line, safe to store and show in the review queue. */
	summary: string;
	details: SenderAuthDetails;
};

const EMPTY_DETAILS: SenderAuthDetails = {
	spf: 'none',
	dkim: 'none',
	dmarc: 'none',
	dkimDomain: null,
	spfDomain: null
};

/**
 * Case-insensitive header lookup returning the topmost value.
 * See the module comment for why later occurrences are discarded.
 */
export function topmostHeader(headers: EmailHeaders | null, name: string): string | null {
	if (!headers) return null;
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== target) continue;
		if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
		return typeof value === 'string' ? value : null;
	}
	return null;
}

/** Domain part of an address, lowercased. */
export function domainOf(address: string): string | null {
	const at = address.lastIndexOf('@');
	if (at === -1 || at === address.length - 1) return null;
	return (
		address
			.slice(at + 1)
			.trim()
			.toLowerCase()
			.replace(/^<|>$/g, '') || null
	);
}

/**
 * Relaxed alignment, in the DMARC sense: the authenticated domain matches the
 * From domain exactly, or is a parent of it. `mail.brand.com` authenticates for
 * `brand.com`, but `brand.com.attacker.net` does not.
 */
export function domainsAlign(authDomain: string | null, fromDomain: string | null): boolean {
	if (!authDomain || !fromDomain) return false;
	const a = authDomain.toLowerCase().replace(/\.$/, '');
	const f = fromDomain.toLowerCase().replace(/\.$/, '');
	if (a === f) return true;
	return f.endsWith(`.${a}`) || a.endsWith(`.${f}`);
}

function readMethod(source: string, method: string): AuthMethodResult {
	// e.g. "dkim=pass header.d=brand.com" or "spf=softfail (...)"
	const match = source.match(new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, 'i'));
	if (!match) return 'none';
	const value = match[1].toLowerCase();
	if (value === 'pass') return 'pass';
	if (value === 'none' || value === 'neutral') return 'none';
	return 'fail';
}

function readIdentifier(source: string, key: string): string | null {
	const match = source.match(new RegExp(`\\b${key}\\s*=\\s*([^\\s;,()]+)`, 'i'));
	return match ? match[1].toLowerCase().replace(/^<|>$/g, '') : null;
}

/** Parse the topmost Authentication-Results, falling back to Received-SPF. */
export function parseAuthenticationResults(headers: EmailHeaders | null): SenderAuthDetails {
	const authResults = topmostHeader(headers, 'authentication-results');

	if (authResults) {
		return {
			spf: readMethod(authResults, 'spf'),
			dkim: readMethod(authResults, 'dkim'),
			dmarc: readMethod(authResults, 'dmarc'),
			dkimDomain: readIdentifier(authResults, 'header\\.d'),
			spfDomain:
				readIdentifier(authResults, 'smtp\\.mailfrom') ?? readIdentifier(authResults, 'smtp\\.helo')
		};
	}

	// Older relays emit only Received-SPF: "pass (domain of x designates ...)"
	const receivedSpf = topmostHeader(headers, 'received-spf');
	if (receivedSpf) {
		const verdict = receivedSpf.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
		const spf: AuthMethodResult =
			verdict === 'pass' ? 'pass' : verdict === 'none' || verdict === 'neutral' ? 'none' : 'fail';
		return {
			...EMPTY_DETAILS,
			spf,
			spfDomain:
				readIdentifier(receivedSpf, 'smtp\\.mailfrom') ??
				receivedSpf.match(/domain of\s+(?:[^@\s]+@)?([^\s]+?)\s/i)?.[1]?.toLowerCase() ??
				null
		};
	}

	return { ...EMPTY_DETAILS };
}

/**
 * Decide whether the message genuinely came from the address it claims.
 *
 * Accepts on DMARC pass, or on a DKIM or SPF pass whose domain aligns with the
 * From domain. An unaligned pass is not enough: any attacker can send mail that
 * passes SPF for a domain they control.
 */
export function evaluateSenderAuth(
	headers: EmailHeaders | null,
	fromEmail: string
): SenderAuthVerdict {
	const details = parseAuthenticationResults(headers);
	const fromDomain = domainOf(fromEmail);

	if (!fromDomain) {
		return { authenticated: false, summary: 'Sender address has no domain', details };
	}

	if (details.dmarc === 'pass') {
		return { authenticated: true, summary: `DMARC pass for ${fromDomain}`, details };
	}

	if (details.dkim === 'pass' && domainsAlign(details.dkimDomain, fromDomain)) {
		return { authenticated: true, summary: `DKIM pass aligned to ${fromDomain}`, details };
	}

	if (details.spf === 'pass' && domainsAlign(details.spfDomain, fromDomain)) {
		return { authenticated: true, summary: `SPF pass aligned to ${fromDomain}`, details };
	}

	if (details.dmarc === 'fail' || details.dkim === 'fail' || details.spf === 'fail') {
		return {
			authenticated: false,
			summary: `Authentication failed (spf=${details.spf}, dkim=${details.dkim}, dmarc=${details.dmarc})`,
			details
		};
	}

	if (details.dkim === 'pass' || details.spf === 'pass') {
		return {
			authenticated: false,
			summary: `Authentication passed for a different domain than ${fromDomain}`,
			details
		};
	}

	return {
		authenticated: false,
		summary: 'No sender authentication results present',
		details
	};
}
