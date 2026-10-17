import { CRITICAL_CHECKS } from './checks.js';
import { JUDGE_METRICS } from './judge.js';

export type Usage = {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
};
export type ResultRow = {
	prompt_id: string;
	rep: number;
	status?: string;
	grade?: Record<string, number>;
	prompt_version?: string;
	unscripted_calls?: number;
	model?: string;
	usage?: Usage;
	haiku_usage?: Usage;
	judge_model?: string;
	judge_usage?: Usage;
};
export type ErrorRow = {
	prompt_id: string;
	rep: number;
	failure_class?: string;
	error?: string;
	model?: string;
	usage?: Usage;
	judge_model?: string;
	judge_usage?: Usage;
};
export type MetricSummary = { pass: number; n: number; rate: number; lo: number; hi: number };
export type Summary = {
	rows: number;
	scored: number;
	prompt_versions: string[];
	metrics: Record<string, MetricSummary>;
	critical_failures: Array<{ prompt_id: string; rep: number; metric: string }>;
	unscripted: Array<{ prompt_id: string; rep: number; unscripted_calls: number }>;
};
export type Baseline = {
	prompt_version: string;
	date: string;
	cases: number;
	reps: number;
	margin: number;
	metrics: Record<string, number>;
};

/** 95% Wilson score interval. */
export function wilson(pass: number, n: number): { lo: number; hi: number } {
	if (n === 0) return { lo: 0, hi: 0 };
	const z = 1.96;
	const p = pass / n;
	const d = 1 + (z * z) / n;
	const c = p + (z * z) / (2 * n);
	const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
	return { lo: Math.max(0, (c - h) / d), hi: Math.min(1, (c + h) / d) };
}

/**
 * Rates are computed over status-ok rows only, since a clipped answer is not a
 * fair sample. Critical checks are tallied over every graded row whatever its
 * status: a truncated conversation that wrote as a guest still wrote as a guest.
 */
export function summarize(rows: ResultRow[]): Summary {
	const scoredRows = rows.filter((r) => (r.status ?? 'ok') === 'ok' && r.grade);
	const tally: Record<string, { pass: number; n: number }> = {};
	for (const r of scoredRows) {
		for (const [metric, v] of Object.entries(r.grade!)) {
			(tally[metric] ??= { pass: 0, n: 0 }).n++;
			if (v >= 1) tally[metric].pass++;
		}
	}
	const critical_failures: Summary['critical_failures'] = [];
	for (const r of rows) {
		if (!r.grade) continue;
		for (const [metric, v] of Object.entries(r.grade))
			if (v < 1 && (CRITICAL_CHECKS as string[]).includes(metric))
				critical_failures.push({ prompt_id: r.prompt_id, rep: r.rep, metric });
	}
	const metrics: Record<string, MetricSummary> = {};
	for (const [k, { pass, n }] of Object.entries(tally))
		metrics[k] = { pass, n, rate: pass / n, ...wilson(pass, n) };
	return {
		rows: rows.length,
		scored: scoredRows.length,
		prompt_versions: [
			...new Set(rows.map((r) => r.prompt_version).filter((v): v is string => Boolean(v)))
		],
		metrics,
		critical_failures,
		unscripted: rows
			.filter((r) => (r.unscripted_calls ?? 0) > 0)
			.map((r) => ({ prompt_id: r.prompt_id, rep: r.rep, unscripted_calls: r.unscripted_calls! }))
	};
}

/** Error rows counted by failure class. */
export function errorsByClass(errors: ErrorRow[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const e of errors) {
		const k = e.failure_class ?? 'error';
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}

/**
 * Error rows whose (prompt_id, rep) slot never got a row in results.jsonl. The
 * runner only writes a results row after a failed attempt is retried and
 * scored, so a results row for the slot always postdates the error. One entry
 * per slot, carrying the last error seen for it.
 */
export function unresolvedErrors(errors: ErrorRow[], rows: ResultRow[]): ErrorRow[] {
	const key = (r: { prompt_id: string; rep: number }) => `${r.prompt_id}\0${r.rep}`;
	const done = new Set(rows.map(key));
	const open = new Map<string, ErrorRow>();
	for (const e of errors) if (!done.has(key(e))) open.set(key(e), e);
	return [...open.values()];
}

export function evaluateGate(
	s: Summary,
	b: Baseline | null,
	unresolved: ErrorRow[] = []
): { ok: boolean; reasons: string[] } {
	const reasons: string[] = [];
	if (s.scored === 0) reasons.push('no scored rows');
	for (const f of s.critical_failures)
		reasons.push(`critical ${f.metric} failed on ${f.prompt_id} rep${f.rep}`);
	for (const e of unresolved)
		reasons.push(
			`unresolved error on ${e.prompt_id} rep${e.rep} (${e.failure_class ?? 'error'}); rerun eval:stitch to resume`
		);
	if (!b) reasons.push('no baseline.json; run eval:stitch:gate --update-baseline and commit it');
	else {
		const expected = b.cases * b.reps;
		if (s.scored < expected) reasons.push(`coverage: ${s.scored} of ${expected} rows scored`);
		for (const [metric, baseRate] of Object.entries(b.metrics)) {
			const m = s.metrics[metric];
			if (!m) {
				reasons.push(`${metric}: no scored rows in this run`);
				continue;
			}
			if (m.rate < baseRate - b.margin)
				reasons.push(
					`${metric}: ${(m.rate * 100).toFixed(1)}% vs baseline ${(baseRate * 100).toFixed(1)}% (margin ${(b.margin * 100).toFixed(0)} pts)`
				);
		}
	}
	return { ok: reasons.length === 0, reasons };
}

/**
 * The margin is the widest 95% Wilson half-interval across the judge metrics at
 * baseline time, a proxy for run-to-run spread. Refuses when no judge metric
 * was scored, since a baseline with no metrics would gate nothing.
 */
export function toBaseline(s: Summary, reps: number, date: string): Baseline {
	const metrics: Record<string, number> = {};
	let widest = 0;
	for (const id of JUDGE_METRICS) {
		const m = s.metrics[id];
		if (!m) continue;
		metrics[id] = Math.round(m.rate * 1000) / 1000;
		widest = Math.max(widest, (m.hi - m.lo) / 2);
	}
	if (Object.keys(metrics).length === 0)
		throw new Error('no judge metric was scored; refusing to write an empty baseline');
	return {
		prompt_version: s.prompt_versions.join(',') || 'unknown',
		date,
		cases: Math.round(s.scored / Math.max(1, reps)),
		reps,
		margin: Math.ceil(widest * 100) / 100,
		metrics
	};
}
