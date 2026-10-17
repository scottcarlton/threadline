#!/usr/bin/env bun
/**
 * Summarise a Stitch eval run and gate it against src/evals/stitch/baseline.json.
 *   bun run eval:stitch:gate [--variant baseline] [--reps 2] [--update-baseline]
 * Exit 0 = pass, 1 = gate failed, 2 = usage or missing results.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
	summarize,
	evaluateGate,
	toBaseline,
	errorsByClass,
	unresolvedErrors,
	spendUsd,
	type Baseline,
	type ErrorRow,
	type Prices,
	type ResultRow
} from '../src/evals/stitch/gate.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const variant = opt('--variant', 'baseline');
const reps = Number(opt('--reps', '2'));
const BASELINE = 'src/evals/stitch/baseline.json';
const FLOW = '.claude/hillclimb/stitch-chat';
const results = `${FLOW}/${variant}/results.jsonl`;
const errorsPath = `${FLOW}/${variant}/errors.jsonl`;

const readJsonl = <T>(p: string): T[] =>
	readFileSync(p, 'utf-8')
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as T);

if (!existsSync(results)) {
	console.error(`no results at ${results}; run bun run eval:stitch first`);
	process.exit(2);
}
const rows = readJsonl<ResultRow>(results);
const errors = existsSync(errorsPath) ? readJsonl<ErrorRow>(errorsPath) : [];
const unresolved = unresolvedErrors(errors, rows);
const s = summarize(rows);

console.log(`rows ${s.rows}, scored ${s.scored}, prompt_version ${s.prompt_versions.join(',')}`);
for (const [k, m] of Object.entries(s.metrics).sort())
	console.log(
		`  ${k.padEnd(20)} ${(m.rate * 100).toFixed(1).padStart(5)}%  (${m.pass}/${m.n}, 95% CI ${(m.lo * 100).toFixed(0)} to ${(m.hi * 100).toFixed(0)})`
	);

if (errors.length) {
	console.log(`errors ${errors.length} (${unresolved.length} slots unresolved)`);
	for (const [k, n] of Object.entries(errorsByClass(errors)).sort())
		console.log(`  ${k.padEnd(20)} ${n}`);
}

if (s.unscripted.length) {
	console.log(`warning: ${s.unscripted.length} rows made tool calls the case does not script`);
	for (const u of s.unscripted)
		console.log(`  ${u.prompt_id} rep${u.rep}: ${u.unscripted_calls} unscripted`);
}

const statePath = existsSync(`${FLOW}/_state.json`)
	? `${FLOW}/_state.json`
	: 'src/evals/stitch/state.template.json';
const prices: Prices = JSON.parse(readFileSync(statePath, 'utf-8')).prices ?? {};
const spend = spendUsd(rows, prices);
const failedSpend = spendUsd(errors, prices);
console.log(
	`spend $${spend.total.toFixed(2)} over ${rows.length} rows (median $${spend.median.toFixed(4)}/row)` +
		(errors.length ? `, plus $${failedSpend.total.toFixed(2)} on failed attempts` : '') +
		` (prices from ${statePath})`
);
const unpriced = [...new Set([...spend.unpriced, ...failedSpend.unpriced])];
if (unpriced.length)
	console.log(`warning: no price for ${unpriced.join(', ')}; that usage is not in the total`);

if (args.includes('--update-baseline')) {
	if (s.critical_failures.length) {
		console.error('refusing to record a baseline with critical failures');
		process.exit(1);
	}
	if (unresolved.length) {
		console.error(
			`refusing to record a baseline with ${unresolved.length} unresolved error rows; rerun eval:stitch to resume`
		);
		process.exit(1);
	}
	let b: Baseline;
	try {
		b = toBaseline(s, reps, new Date().toISOString().slice(0, 10));
	} catch (e) {
		console.error(`refusing to record a baseline: ${(e as Error).message}`);
		process.exit(1);
	}
	writeFileSync(BASELINE, JSON.stringify(b, null, '\t') + '\n');
	console.log(
		`wrote ${BASELINE} (margin ${(b.margin * 100).toFixed(0)} pts); review and commit it`
	);
	process.exit(0);
}

const baseline: Baseline | null = existsSync(BASELINE)
	? JSON.parse(readFileSync(BASELINE, 'utf-8'))
	: null;
const gate = evaluateGate(s, baseline, unresolved);
for (const r of gate.reasons) console.log(`  FAIL ${r}`);
console.log(gate.ok ? 'gate: pass' : 'gate: fail');
process.exit(gate.ok ? 0 : 1);
