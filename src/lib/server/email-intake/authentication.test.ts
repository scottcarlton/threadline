import { describe, it, expect } from 'vitest';
import {
	evaluateSenderAuth,
	parseAuthenticationResults,
	topmostHeader,
	domainOf,
	domainsAlign
} from './authentication.js';

const REP = 'dana@mercer-reps.com';

describe('topmostHeader', () => {
	it('is case-insensitive', () => {
		expect(topmostHeader({ 'Authentication-Results': 'spf=pass' }, 'authentication-results')).toBe(
			'spf=pass'
		);
	});

	// The security property: each MTA prepends its own, so index 0 is the one
	// our receiving infrastructure wrote and the rest are hearsay.
	it('takes the first value when a header repeats, ignoring forged copies below', () => {
		const headers = {
			'Authentication-Results': ['spf=fail dkim=fail', 'dmarc=pass dkim=pass header.d=evil.com']
		};
		expect(topmostHeader(headers, 'authentication-results')).toBe('spf=fail dkim=fail');
	});

	it('returns null for a missing header or null headers', () => {
		expect(topmostHeader({}, 'authentication-results')).toBeNull();
		expect(topmostHeader(null, 'authentication-results')).toBeNull();
	});
});

describe('domainOf', () => {
	it('extracts and lowercases the domain', () => {
		expect(domainOf('Dana@Mercer-Reps.com')).toBe('mercer-reps.com');
	});

	it('returns null for a malformed address', () => {
		expect(domainOf('not-an-address')).toBeNull();
		expect(domainOf('trailing@')).toBeNull();
	});
});

describe('domainsAlign', () => {
	it('accepts an exact match and a subdomain of the authenticated domain', () => {
		expect(domainsAlign('mercer-reps.com', 'mercer-reps.com')).toBe(true);
		expect(domainsAlign('mercer-reps.com', 'mail.mercer-reps.com')).toBe(true);
		expect(domainsAlign('mail.mercer-reps.com', 'mercer-reps.com')).toBe(true);
	});

	// The lookalike an attacker registers.
	it('rejects a domain that merely contains the real one', () => {
		expect(domainsAlign('mercer-reps.com.attacker.net', 'mercer-reps.com')).toBe(false);
		expect(domainsAlign('notmercer-reps.com', 'mercer-reps.com')).toBe(false);
	});

	it('rejects when either side is missing', () => {
		expect(domainsAlign(null, 'mercer-reps.com')).toBe(false);
		expect(domainsAlign('mercer-reps.com', null)).toBe(false);
	});
});

describe('parseAuthenticationResults', () => {
	it('reads spf, dkim, dmarc and their identifiers', () => {
		const details = parseAuthenticationResults({
			'Authentication-Results':
				'mx.brevo.com; spf=pass smtp.mailfrom=mercer-reps.com; dkim=pass header.d=mercer-reps.com; dmarc=pass'
		});
		expect(details).toEqual({
			spf: 'pass',
			dkim: 'pass',
			dmarc: 'pass',
			dkimDomain: 'mercer-reps.com',
			spfDomain: 'mercer-reps.com'
		});
	});

	it('treats softfail and temperror as failure, neutral as none', () => {
		expect(parseAuthenticationResults({ 'Authentication-Results': 'spf=softfail' }).spf).toBe(
			'fail'
		);
		expect(parseAuthenticationResults({ 'Authentication-Results': 'dkim=temperror' }).dkim).toBe(
			'fail'
		);
		expect(parseAuthenticationResults({ 'Authentication-Results': 'spf=neutral' }).spf).toBe(
			'none'
		);
	});

	it('falls back to Received-SPF when Authentication-Results is absent', () => {
		const details = parseAuthenticationResults({
			'Received-SPF': 'pass (spool5: domain of mercer-reps.com designates 1.2.3.4 as permitted)'
		});
		expect(details.spf).toBe('pass');
		expect(details.spfDomain).toBe('mercer-reps.com');
	});

	it('returns all-none for empty headers', () => {
		expect(parseAuthenticationResults(null)).toMatchObject({
			spf: 'none',
			dkim: 'none',
			dmarc: 'none'
		});
	});
});

describe('evaluateSenderAuth', () => {
	it('accepts a DMARC pass', () => {
		const verdict = evaluateSenderAuth(
			{ 'Authentication-Results': 'spf=pass dkim=pass dmarc=pass' },
			REP
		);
		expect(verdict.authenticated).toBe(true);
	});

	it('accepts a DKIM pass aligned to the From domain', () => {
		const verdict = evaluateSenderAuth(
			{ 'Authentication-Results': 'dkim=pass header.d=mercer-reps.com' },
			REP
		);
		expect(verdict.authenticated).toBe(true);
	});

	it('accepts an SPF pass aligned to the From domain', () => {
		const verdict = evaluateSenderAuth(
			{ 'Authentication-Results': 'spf=pass smtp.mailfrom=mercer-reps.com' },
			REP
		);
		expect(verdict.authenticated).toBe(true);
	});

	// The whole point of alignment. Anyone can pass SPF for a domain they own.
	it('rejects a pass that belongs to a domain the attacker controls', () => {
		const verdict = evaluateSenderAuth(
			{
				'Authentication-Results':
					'spf=pass smtp.mailfrom=attacker.net; dkim=pass header.d=attacker.net'
			},
			REP
		);
		expect(verdict.authenticated).toBe(false);
		expect(verdict.summary).toContain('different domain');
	});

	// F-1 itself: a spoofed From with nothing to back it.
	it('rejects a message with no authentication headers at all', () => {
		const verdict = evaluateSenderAuth(null, REP);
		expect(verdict.authenticated).toBe(false);
		expect(verdict.summary).toContain('No sender authentication');
	});

	it('rejects an explicit failure', () => {
		const verdict = evaluateSenderAuth(
			{ 'Authentication-Results': 'spf=fail dkim=fail dmarc=fail' },
			REP
		);
		expect(verdict.authenticated).toBe(false);
	});

	it('ignores a forged Authentication-Results below the real one', () => {
		const verdict = evaluateSenderAuth(
			{
				'Authentication-Results': [
					'mx.brevo.com; spf=fail dkim=fail dmarc=fail',
					'dmarc=pass dkim=pass header.d=mercer-reps.com'
				]
			},
			REP
		);
		expect(verdict.authenticated).toBe(false);
	});

	it('rejects a sender address with no domain', () => {
		const verdict = evaluateSenderAuth({ 'Authentication-Results': 'dmarc=pass' }, 'garbage');
		expect(verdict.authenticated).toBe(false);
	});

	it('always returns a summary worth storing', () => {
		for (const headers of [null, { 'Authentication-Results': 'spf=fail' }]) {
			expect(evaluateSenderAuth(headers, REP).summary.length).toBeGreaterThan(10);
		}
	});
});
