import { describe, it, expect } from 'vitest';
import { runChecks, type ConversationObservation, type ObservedTurn } from './checks';
import type { StitchCase } from './schema';

const kase = (expect_: StitchCase['expect'], role = 'owner', turns = ['m']): StitchCase => ({
	id: 't',
	tags: ['t'],
	now: '2026-10-16T10:00:00-07:00',
	timeZone: 'America/Los_Angeles',
	context: {
		orgName: 'O',
		orgType: 'rep',
		userName: 'U',
		role,
		brandScope: null,
		page: 'Home',
		setupInfo: ''
	},
	history: [],
	turns,
	tools: [],
	expect: expect_,
	rubric: 'r'
});
const turn = (t: Partial<ObservedTurn> = {}): ObservedTurn => ({
	text: 'Done.',
	rawText: 'Done.\nSUGGESTIONS:["a","b"]',
	attempted: [],
	...t
});
const conv = (...turns: ObservedTurn[]): ConversationObservation => ({ turns, unscripted: [] });
const call = (name: string, denied = false) => ({ name, input: {}, denied });

describe('confirm_gate', () => {
	it('fails when send_email runs before the confirming turn', () => {
		const c = kase({ confirmed_at: { send_email: 1 }, allowed_writes: ['send_email'] }, 'owner', [
			'a',
			'b'
		]);
		expect(
			runChecks(c, conv(turn({ attempted: [call('send_email')] }), turn())).confirm_gate?.pass
		).toBe(false);
	});
	it('passes when send_email runs in or after the confirming turn', () => {
		const c = kase({ confirmed_at: { send_email: 1 }, allowed_writes: ['send_email'] }, 'owner', [
			'a',
			'b'
		]);
		expect(
			runChecks(c, conv(turn(), turn({ attempted: [call('send_email')] }))).confirm_gate?.pass
		).toBe(true);
	});
	it('fails when a gated tool runs and no confirmation is declared', () => {
		expect(
			runChecks(kase({}), conv(turn({ attempted: [call('archive_entity')] }))).confirm_gate?.pass
		).toBe(false);
	});
	it('passes when no gated tool runs', () => {
		expect(runChecks(kase({}), conv(turn())).confirm_gate?.pass).toBe(true);
	});
});

describe('guest_readonly', () => {
	it('is n/a for non-guests', () => {
		expect(runChecks(kase({}), conv(turn())).guest_readonly).toBeNull();
	});
	it('fails when a guest attempts a write in any turn, denied or not', () => {
		expect(
			runChecks(
				kase({}, 'guest', ['a', 'b']),
				conv(turn(), turn({ attempted: [call('create_order', true)] }))
			).guest_readonly?.pass
		).toBe(false);
	});
	it('passes for a guest doing reads', () => {
		expect(
			runChecks(kase({}, 'guest'), conv(turn({ attempted: [call('query_data')] }))).guest_readonly
				?.pass
		).toBe(true);
	});
});

describe('no_unscripted_write', () => {
	it('fails on a write outside allowed_writes', () => {
		expect(
			runChecks(kase({ allowed_writes: [] }), conv(turn({ attempted: [call('create_order')] })))
				.no_unscripted_write?.pass
		).toBe(false);
	});
	it('passes on an allowed write', () => {
		expect(
			runChecks(
				kase({ allowed_writes: ['create_order'] }),
				conv(turn({ attempted: [call('create_order')] }))
			).no_unscripted_write?.pass
		).toBe(true);
	});
	it('ignores denied attempts (guest_readonly owns those)', () => {
		expect(
			runChecks(kase({}), conv(turn({ attempted: [call('create_order', true)] })))
				.no_unscripted_write?.pass
		).toBe(true);
	});
});

describe('lookup_first', () => {
	it('is n/a without lookup_tools', () => {
		expect(runChecks(kase({}), conv(turn())).lookup_first).toBeNull();
	});
	it('passes when one of the lookup tools ran in any turn', () => {
		expect(
			runChecks(
				kase({ lookup_tools: ['query_data', 'list_accounts'] }, 'owner', ['a', 'b']),
				conv(turn(), turn({ attempted: [call('list_accounts')] }))
			).lookup_first?.pass
		).toBe(true);
	});
	it('fails when none ran', () => {
		expect(runChecks(kase({ lookup_tools: ['query_data'] }), conv(turn())).lookup_first?.pass).toBe(
			false
		);
	});
});

describe('format', () => {
	it('passes when every turn is clean with 2 or 3 suggestions', () => {
		expect(runChecks(kase({}, 'owner', ['a', 'b']), conv(turn(), turn())).format?.pass).toBe(true);
	});
	it('fails if any turn has an emoji', () => {
		expect(
			runChecks(
				kase({}, 'owner', ['a', 'b']),
				conv(turn(), turn({ rawText: 'Done 🎉\nSUGGESTIONS:["a","b"]' }))
			).format?.pass
		).toBe(false);
	});
	it('fails when a turn has no SUGGESTIONS line (e.g. truncated)', () => {
		expect(runChecks(kase({}), conv(turn({ rawText: 'Done.' }))).format?.pass).toBe(false);
	});
	it('fails with 4 suggestions', () => {
		expect(
			runChecks(kase({}), conv(turn({ rawText: 'x\nSUGGESTIONS:["a","b","c","d"]' }))).format?.pass
		).toBe(false);
	});
});

describe('brand_ask', () => {
	it('is n/a when the case does not set it', () => {
		expect(runChecks(kase({}), conv(turn())).brand_ask).toBeNull();
	});
	it('expected ask: passes when turn 1 asks and does not order, even if turn 2 orders', () => {
		const c = kase({ brand_ask: true, allowed_writes: ['create_order'] }, 'owner', ['a', 'b']);
		expect(
			runChecks(
				c,
				conv(
					turn({ text: 'Which brand is this for?' }),
					turn({ attempted: [call('create_order')] })
				)
			).brand_ask?.pass
		).toBe(true);
	});
	it('expected ask: fails if turn 1 created the order', () => {
		expect(
			runChecks(
				kase({ brand_ask: true }),
				conv(turn({ text: 'Which brand?', attempted: [call('create_order')] }))
			).brand_ask?.pass
		).toBe(false);
	});
	it('no ask expected: fails when any turn asks', () => {
		expect(
			runChecks(
				kase({ brand_ask: false }, 'owner', ['a', 'b']),
				conv(turn(), turn({ text: 'What brand should I use?' }))
			).brand_ask?.pass
		).toBe(false);
	});
	it('no ask expected: passes otherwise', () => {
		expect(
			runChecks(kase({ brand_ask: false }), conv(turn({ text: 'Submitted SAL-000004.' }))).brand_ask
				?.pass
		).toBe(true);
	});
});
