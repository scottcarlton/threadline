/**
 * Redaction for audit payloads.
 *
 * An audit log is read by support during incidents and retained for a long
 * time, so it must never become a secondary store of secrets or bulk PII.
 * Everything written to `metadata` / `changes` passes through here first.
 */

/** Key names whose values are always replaced, at any depth. */
const SECRET_KEY =
	/(pass(word)?|secret|token|api[-_]?key|authorization|credential|cookie|signature|otp|refresh|client[-_]?secret)/i;

/**
 * Key names holding personal data. These are NOT secrets, so a secret stripper
 * misses them, but they are the fields most likely to matter under a data
 * request — and freeform payloads (an AI tool's `tool_input`, an import row)
 * carry them routinely.
 *
 * They are masked rather than dropped: support needs to tell *which* buyer a
 * row refers to, which a partial value answers and a `[redacted]` does not.
 */
const PII_EMAIL_KEY = /e[-_]?mail/i;
const PII_PHONE_KEY = /(phone|mobile|fax)/i;
const PII_KEY =
	/(address_?line|street|postal|zip|tax_?id|\bein\b|\bssn\b|date_?of_?birth|\bdob\b|national_?id|passport)/i;

const REDACTED = '[redacted]';
const REDACTED_PII = '[redacted:pii]';

/** `ada@acme.co` → `a•••@acme.co`. Enough to identify, not enough to contact. */
export function maskEmail(value: string): string {
	const at = value.lastIndexOf('@');
	if (at < 1) return REDACTED_PII;
	return `${value[0]}•••${value.slice(at)}`;
}

/** Keeps the last four digits, the part a human quotes back during support. */
export function maskPhone(value: string): string {
	const digits = value.replace(/\D/g, '');
	if (digits.length < 4) return REDACTED_PII;
	return `•••${digits.slice(-4)}`;
}

function maskByKey(key: string, value: unknown): unknown | undefined {
	if (typeof value !== 'string' || value.length === 0) {
		return PII_EMAIL_KEY.test(key) || PII_PHONE_KEY.test(key) || PII_KEY.test(key)
			? REDACTED_PII
			: undefined;
	}
	if (PII_EMAIL_KEY.test(key)) return maskEmail(value);
	if (PII_PHONE_KEY.test(key)) return maskPhone(value);
	if (PII_KEY.test(key)) return REDACTED_PII;
	return undefined;
}

/** Long free text (an assistant prompt, a note) is kept but capped. */
const MAX_STRING = 500;
const MAX_DEPTH = 5;
const MAX_ARRAY = 50;

export function redact(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value ?? null;
	if (depth > MAX_DEPTH) return '[truncated: max depth]';

	if (typeof value === 'string') {
		return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [truncated]` : value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') return value;

	if (Array.isArray(value)) {
		const clipped = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
		if (value.length > MAX_ARRAY) clipped.push(`[${value.length - MAX_ARRAY} more]`);
		return clipped;
	}

	if (typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
			if (SECRET_KEY.test(key)) {
				out[key] = REDACTED;
				continue;
			}
			const masked = maskByKey(key, v);
			out[key] = masked !== undefined ? masked : redact(v, depth + 1);
		}
		return out;
	}

	// Functions, symbols, bigints: not meaningful in an audit payload.
	return String(value);
}

export function redactRecord(
	value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
	if (!value) return null;
	return redact(value) as Record<string, unknown>;
}

/**
 * Explicit field allow-list for freeform payloads.
 *
 * The maskers above are a safety net, not a policy. When a call site knows the
 * shape of what it is recording — an AI tool's arguments, an import row — it
 * should name the fields it wants rather than trusting key-name heuristics to
 * catch everything.
 */
export function pick<T extends Record<string, unknown>>(
	source: T | null | undefined,
	keys: readonly string[]
): Record<string, unknown> {
	if (!source) return {};
	const out: Record<string, unknown> = {};
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
	}
	return out;
}
