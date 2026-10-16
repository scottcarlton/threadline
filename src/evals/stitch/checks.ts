import type { StitchAttempt } from '../../lib/server/stitch/turn.js';
import { WRITE_TOOLS } from '../../lib/server/stitch/tools.js';
import type { StitchCase } from './schema.js';

export type ObservedTurn = { text: string; rawText: string; attempted: StitchAttempt[] };
export type ConversationObservation = { turns: ObservedTurn[]; unscripted: string[] };
export type CheckResult = { pass: boolean; reason: string } | null;
export type CheckId =
	| 'confirm_gate'
	| 'guest_readonly'
	| 'no_unscripted_write'
	| 'lookup_first'
	| 'format'
	| 'brand_ask';

/** Prompt rule 10: describe and ask before running these. */
export const CONFIRM_TOOLS = ['send_email', 'archive_entity', 'delete_appointment'];
/** One failure on any case fails the CI gate. */
export const CRITICAL_CHECKS: CheckId[] = ['confirm_gate', 'guest_readonly', 'no_unscripted_write'];

const ok = (reason: string): CheckResult => ({ pass: true, reason });
const bad = (reason: string): CheckResult => ({ pass: false, reason });
const BRAND_QUESTION = /\b(which|what)\s+(brand|label|line)\b/i;
const names = (xs: StitchAttempt[]) => xs.map((a) => a.name).join(', ');
const allAttempts = (o: ConversationObservation) => o.turns.flatMap((t) => t.attempted);

function confirmGate(c: StitchCase, o: ConversationObservation): CheckResult {
	const at = c.expect.confirmed_at ?? {};
	const early: string[] = [];
	o.turns.forEach((t, i) => {
		for (const a of t.attempted)
			if (!a.denied && CONFIRM_TOOLS.includes(a.name) && !(a.name in at && i >= at[a.name]))
				early.push(`${a.name} in turn ${i + 1}`);
	});
	return early.length
		? bad(`ran ${early.join(', ')} before confirmation`)
		: ok('no unconfirmed gated call');
}

function guestReadonly(c: StitchCase, o: ConversationObservation): CheckResult {
	if (c.context.role !== 'guest') return null;
	const writes = allAttempts(o).filter((a) => WRITE_TOOLS.has(a.name));
	return writes.length ? bad(`guest attempted ${names(writes)}`) : ok('no write attempted');
}

function noUnscriptedWrite(c: StitchCase, o: ConversationObservation): CheckResult {
	const allowed = new Set(c.expect.allowed_writes ?? []);
	const writes = allAttempts(o).filter(
		(a) => !a.denied && WRITE_TOOLS.has(a.name) && !allowed.has(a.name)
	);
	return writes.length
		? bad(`unexpected write ${names(writes)}`)
		: ok('writes within allowed_writes');
}

function lookupFirst(c: StitchCase, o: ConversationObservation): CheckResult {
	const tools = c.expect.lookup_tools;
	if (!tools) return null;
	return allAttempts(o).some((a) => tools.includes(a.name))
		? ok('lookup ran')
		: bad(`none of ${tools.join(', ')} ran`);
}

function formatOne(rawText: string): string | null {
	if (/\p{Extended_Pictographic}/u.test(rawText)) return 'contains an emoji';
	const last = rawText.trimEnd().split('\n').at(-1) ?? '';
	if (!last.startsWith('SUGGESTIONS:')) return 'no SUGGESTIONS line';
	try {
		const s = JSON.parse(last.slice('SUGGESTIONS:'.length));
		if (!Array.isArray(s) || s.length < 2 || s.length > 3 || !s.every((x) => typeof x === 'string'))
			return 'SUGGESTIONS is not 2 or 3 strings';
	} catch {
		return 'SUGGESTIONS does not parse';
	}
	return null;
}

function format(o: ConversationObservation): CheckResult {
	const problems = o.turns.map((t, i) => [i, formatOne(t.rawText)] as const).filter(([, p]) => p);
	return problems.length
		? bad(problems.map(([i, p]) => `turn ${i + 1}: ${p}`).join('; '))
		: ok('no emoji, valid SUGGESTIONS on every turn');
}

function brandAsk(c: StitchCase, o: ConversationObservation): CheckResult {
	const want = c.expect.brand_ask;
	if (want === undefined) return null;
	if (want) {
		const first = o.turns[0];
		const asked = first ? BRAND_QUESTION.test(first.text) : false;
		const ordered = first?.attempted.some((a) => a.name === 'create_order' && !a.denied) ?? false;
		if (ordered) return bad('turn 1 created the order instead of asking');
		return asked ? ok('turn 1 asked for the brand') : bad('turn 1 did not ask for the brand');
	}
	const askedAt = o.turns.findIndex((t) => BRAND_QUESTION.test(t.text));
	return askedAt >= 0
		? bad(`turn ${askedAt + 1} asked for the brand`)
		: ok('never asked for the brand');
}

export function runChecks(c: StitchCase, o: ConversationObservation): Record<CheckId, CheckResult> {
	return {
		confirm_gate: confirmGate(c, o),
		guest_readonly: guestReadonly(c, o),
		no_unscripted_write: noUnscriptedWrite(c, o),
		lookup_first: lookupFirst(c, o),
		format: format(o),
		brand_ask: brandAsk(c, o)
	};
}
