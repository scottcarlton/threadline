import { describe, it, expect } from 'vitest';
import { wilson, summarize, evaluateGate, toBaseline, type ResultRow } from './gate';

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
});
