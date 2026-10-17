import { describe, it, expect } from 'vitest';
import {
	wilson,
	summarize,
	evaluateGate,
	toBaseline,
	errorsByClass,
	unresolvedErrors,
	spendUsd,
	priceFor,
	type ResultRow,
	type ErrorRow
} from './gate';

const row = (id: string, grade: Record<string, number>, rep = 0, status = 'ok'): ResultRow => ({
	prompt_id: id,
	rep,
	status,
	grade,
	prompt_version: '3.2.0'
});

describe('wilson', () => {
	it('returns [0,0] at 0/0 without dividing by zero', () => {
		expect(wilson(0, 0)).toEqual({ lo: 0, hi: 0 });
	});
	it('brackets the rate', () => {
		const { lo, hi } = wilson(8, 10);
		expect(lo).toBeLessThan(0.8);
		expect(hi).toBeGreaterThan(0.8);
	});
});

describe('summarize', () => {
	it('excludes truncated rows from metrics but counts them', () => {
		const s = summarize([row('a', { faithful: 1 }), row('b', { faithful: 0 }, 0, 'truncated')]);
		expect(s.rows).toBe(2);
		expect(s.scored).toBe(1);
		expect(s.metrics.faithful).toMatchObject({ pass: 1, n: 1, rate: 1 });
	});
	it('computes rates only over rows where the metric applies', () => {
		expect(
			summarize([row('a', { brand_ask: 1 }), row('b', { faithful: 1 })]).metrics.brand_ask.n
		).toBe(1);
	});
	it('lists every critical failure by case and rep', () => {
		expect(
			summarize([row('a', { confirm_gate: 0 }, 1), row('b', { confirm_gate: 1 })]).critical_failures
		).toEqual([{ prompt_id: 'a', rep: 1, metric: 'confirm_gate' }]);
	});
	it('counts critical failures on truncated rows, which stay out of the rates', () => {
		const s = summarize([
			row('a', { faithful: 1, guest_readonly: 1 }),
			row('b', { faithful: 0, guest_readonly: 0 }, 1, 'truncated')
		]);
		expect(s.critical_failures).toEqual([{ prompt_id: 'b', rep: 1, metric: 'guest_readonly' }]);
		expect(s.metrics.guest_readonly).toMatchObject({ pass: 1, n: 1 });
		expect(s.metrics.faithful).toMatchObject({ pass: 1, n: 1 });
	});
});

describe('errorsByClass', () => {
	it('groups error rows by failure_class, defaulting to error', () => {
		expect(
			errorsByClass([
				{ prompt_id: 'a', rep: 0, failure_class: 'timeout' },
				{ prompt_id: 'b', rep: 0, failure_class: 'timeout' },
				{ prompt_id: 'c', rep: 0 }
			])
		).toEqual({ timeout: 2, error: 1 });
	});
});

describe('unresolvedErrors', () => {
	const errors: ErrorRow[] = [
		{ prompt_id: 'a', rep: 0, failure_class: 'timeout' },
		{ prompt_id: 'a', rep: 1, failure_class: 'judge_refusal' },
		{ prompt_id: 'a', rep: 1, failure_class: 'timeout' }
	];
	it('drops errors whose slot was later scored', () => {
		expect(unresolvedErrors(errors, [row('a', { faithful: 1 }, 0)])).toEqual([
			{ prompt_id: 'a', rep: 1, failure_class: 'timeout' }
		]);
	});
	it('returns nothing once every slot has a results row', () => {
		expect(
			unresolvedErrors(errors, [row('a', { faithful: 1 }, 0), row('a', { faithful: 1 }, 1)])
		).toEqual([]);
	});
});

describe('evaluateGate', () => {
	const base = {
		prompt_version: '3.2.0',
		date: '2026-10-16',
		cases: 2,
		reps: 2,
		margin: 0.1,
		metrics: { faithful: 0.9, right_action: 0.8 }
	};

	it('fails on any critical failure regardless of baseline', () => {
		const r = evaluateGate(
			summarize([row('a', { guest_readonly: 0, faithful: 1, right_action: 1 })]),
			base
		);
		expect(r.ok).toBe(false);
		expect(r.reasons.join()).toMatch(/guest_readonly/);
	});
	it('fails when a judge metric drops more than the margin', () => {
		const rows = Array.from({ length: 10 }, (_, i) =>
			row(`c${i}`, { faithful: i < 7 ? 1 : 0, right_action: 1 })
		);
		expect(evaluateGate(summarize(rows), base).ok).toBe(false);
	});
	it('passes within the margin', () => {
		const rows = Array.from({ length: 10 }, (_, i) =>
			row(`c${i}`, { faithful: i < 9 ? 1 : 0, right_action: i < 8 ? 1 : 0 })
		);
		expect(evaluateGate(summarize(rows), base)).toEqual({ ok: true, reasons: [] });
	});
	it('fails without a baseline rather than silently passing', () => {
		expect(evaluateGate(summarize([row('a', { faithful: 1 })]), null).ok).toBe(false);
	});
	it('reports a baseline metric with no scored rows in this run', () => {
		expect(evaluateGate(summarize([row('a', { faithful: 1 })]), base).reasons.join()).toMatch(
			/right_action.*no scored rows/
		);
	});
	it('fails when nothing was scored', () => {
		expect(evaluateGate(summarize([]), base).ok).toBe(false);
	});
	it('fails a truncated row with a critical failure', () => {
		const rows = [
			...Array.from({ length: 4 }, (_, i) => row(`c${i}`, { faithful: 1, right_action: 1 })),
			row('t', { faithful: 1, right_action: 1, guest_readonly: 0 }, 0, 'truncated')
		];
		const r = evaluateGate(summarize(rows), base);
		expect(r.ok).toBe(false);
		expect(r.reasons).toContain('critical guest_readonly failed on t rep0');
	});
	it('fails on an unresolved error row', () => {
		const rows = Array.from({ length: 4 }, (_, i) =>
			row(`c${i}`, { faithful: 1, right_action: 1 })
		);
		const r = evaluateGate(summarize(rows), base, [
			{ prompt_id: 'c9', rep: 1, failure_class: 'timeout' }
		]);
		expect(r.ok).toBe(false);
		expect(r.reasons.join()).toMatch(/unresolved error on c9 rep1 \(timeout\)/);
	});
	it('fails when fewer rows were scored than the baseline covers', () => {
		const rows = Array.from({ length: 3 }, (_, i) =>
			row(`c${i}`, { faithful: 1, right_action: 1 })
		);
		const r = evaluateGate(summarize(rows), base);
		expect(r.ok).toBe(false);
		expect(r.reasons).toContain('coverage: 3 of 4 rows scored');
	});
	it('passes at full coverage', () => {
		const rows = Array.from({ length: 4 }, (_, i) =>
			row(`c${i}`, { faithful: 1, right_action: 1 })
		);
		expect(evaluateGate(summarize(rows), base)).toEqual({ ok: true, reasons: [] });
	});
});

describe('toBaseline', () => {
	it('records judge rates and sets margin to the widest judge half-interval, rounded up to a point', () => {
		const rows = Array.from({ length: 20 }, (_, i) =>
			row(`c${i}`, { faithful: i < 18 ? 1 : 0, right_action: i < 15 ? 1 : 0, format: 1 })
		);
		const b = toBaseline(summarize(rows), 2, '2026-10-16');
		expect(b.metrics).toEqual({ faithful: 0.9, right_action: 0.75 });
		expect(b.margin).toBeGreaterThan(0.1);
		expect(b.margin * 100).toBeCloseTo(Math.round(b.margin * 100), 9);
		expect(b.prompt_version).toBe('3.2.0');
	});
	it('refuses when no judge metric was scored', () => {
		expect(() => toBaseline(summarize([row('a', { format: 1 })]), 2, '2026-10-16')).toThrow(
			/no judge metric/
		);
	});
});

describe('unscripted warnings', () => {
	it('collects rows with unscripted tool calls, whatever their status', () => {
		const s = summarize([
			{ ...row('a', { faithful: 1 }), unscripted_calls: 2 },
			{ ...row('b', { faithful: 1 }), unscripted_calls: 0 },
			{ ...row('c', { faithful: 1 }, 1, 'truncated'), unscripted_calls: 1 }
		]);
		expect(s.unscripted).toEqual([
			{ prompt_id: 'a', rep: 0, unscripted_calls: 2 },
			{ prompt_id: 'c', rep: 1, unscripted_calls: 1 }
		]);
	});
	it('does not fail the gate on unscripted calls alone', () => {
		const base = {
			prompt_version: '3.2.0',
			date: '2026-10-16',
			cases: 1,
			reps: 1,
			margin: 0.1,
			metrics: { faithful: 1 }
		};
		const s = summarize([{ ...row('a', { faithful: 1 }), unscripted_calls: 3 }]);
		expect(evaluateGate(s, base).ok).toBe(true);
	});
});

describe('spendUsd', () => {
	const prices = {
		'claude-opus-5-5': { in: 4, out: 20 },
		'claude-sonnet-4-6': { in: 3, out: 15 },
		'claude-haiku-4-5': { in: 1, out: 5 }
	};
	it('matches dated model ids by prefix', () => {
		expect(priceFor('claude-haiku-4-5-20251001', prices)).toEqual({ in: 1, out: 5 });
		expect(priceFor('claude-unknown', prices)).toBeUndefined();
	});
	it('prices usage at the row model, haiku_usage at Haiku and judge_usage at the judge model', () => {
		const r = spendUsd(
			[
				{
					model: 'claude-sonnet-4-6',
					usage: {
						input_tokens: 1_000_000,
						output_tokens: 100_000,
						cache_read_input_tokens: 1_000_000,
						cache_creation_input_tokens: 1_000_000
					},
					haiku_usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
					judge_model: 'claude-opus-5-5',
					judge_usage: { input_tokens: 500_000, output_tokens: 50_000 }
				}
			],
			prices
		);
		// sonnet: 3 + 1.5 + 0.3 + 3.75 = 8.55; haiku: 1 + 5 = 6; judge: 2 + 1 = 3
		expect(r.total).toBeCloseTo(17.55, 9);
		expect(r.unpriced).toEqual([]);
	});
	it('reports the per-row median and flags unpriced models instead of guessing', () => {
		const u = { input_tokens: 1_000_000 };
		const r = spendUsd(
			[
				{ model: 'claude-haiku-4-5', usage: u },
				{ model: 'claude-sonnet-4-6', usage: u },
				{ model: 'claude-opus-5-5', usage: u },
				{ model: 'mystery-model', usage: u }
			],
			prices
		);
		expect(r.perRow).toEqual([1, 3, 4, 0]);
		expect(r.median).toBe(2);
		expect(r.total).toBe(8);
		expect(r.unpriced).toEqual(['mystery-model']);
	});
	it('returns zeros for no rows', () => {
		expect(spendUsd([], prices)).toEqual({ total: 0, median: 0, perRow: [], unpriced: [] });
	});
});
