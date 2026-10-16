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
	type Baseline,
	type ResultRow
} from '../src/evals/stitch/gate.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const variant = opt('--variant', 'baseline');
const reps = Number(opt('--reps', '2'));
const BASELINE = 'src/evals/stitch/baseline.json';
const results = `.claude/hillclimb/stitch-chat/${variant}/results.jsonl`;

if (!existsSync(results)) {
	console.error(`no results at ${results}; run bun run eval:stitch first`);
	process.exit(2);
}
const rows = readFileSync(results, 'utf-8')
	.split('\n')
	.filter((l) => l.trim())
	.map((l) => JSON.parse(l) as ResultRow);
const s = summarize(rows);

console.log(`rows ${s.rows}, scored ${s.scored}, prompt_version ${s.prompt_versions.join(',')}`);
for (const [k, m] of Object.entries(s.metrics).sort())
	console.log(
		`  ${k.padEnd(20)} ${(m.rate * 100).toFixed(1).padStart(5)}%  (${m.pass}/${m.n}, 95% CI ${(m.lo * 100).toFixed(0)} to ${(m.hi * 100).toFixed(0)})`
	);

if (args.includes('--update-baseline')) {
	if (s.critical_failures.length) {
		console.error('refusing to record a baseline with critical failures');
		process.exit(1);
	}
	const b = toBaseline(s, reps, new Date().toISOString().slice(0, 10));
	writeFileSync(BASELINE, JSON.stringify(b, null, '\t') + '\n');
	console.log(
		`wrote ${BASELINE} (margin ${(b.margin * 100).toFixed(0)} pts); review and commit it`
	);
	process.exit(0);
}

const baseline: Baseline | null = existsSync(BASELINE)
	? JSON.parse(readFileSync(BASELINE, 'utf-8'))
	: null;
const gate = evaluateGate(s, baseline);
for (const r of gate.reasons) console.log(`  FAIL ${r}`);
console.log(gate.ok ? 'gate: pass' : 'gate: fail');
process.exit(gate.ok ? 0 : 1);
