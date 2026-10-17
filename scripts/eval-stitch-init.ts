#!/usr/bin/env bun
/**
 * Creates the local run folder for the Stitch eval and seeds _state.json from
 * the committed template. Never overwrites an existing _state.json, which holds
 * the locally approved harness sha.
 */
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';

const FLOW = '.claude/hillclimb/stitch-chat';
mkdirSync(FLOW, { recursive: true });
if (!existsSync(`${FLOW}/_state.json`)) {
	copyFileSync('src/evals/stitch/state.template.json', `${FLOW}/_state.json`);
	console.error(`seeded ${FLOW}/_state.json from src/evals/stitch/state.template.json`);
}
