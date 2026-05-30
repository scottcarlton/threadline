/**
 * Load and save cached parser outputs (.parsed.json) for eval fixtures.
 *
 * loadParsed() reads from disk — deterministic, no LLM call.
 * refreshParsed() calls the live Anthropic parser and saves — opt-in only.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ParsedOrder } from '../parser';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

export function loadParsed(fixtureName: string): ParsedOrder | null {
	const path = join(FIXTURES_DIR, `${fixtureName}.parsed.json`);
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, 'utf-8')) as ParsedOrder;
}

export function saveParsed(fixtureName: string, parsed: ParsedOrder): void {
	const path = join(FIXTURES_DIR, `${fixtureName}.parsed.json`);
	writeFileSync(path, JSON.stringify(parsed, null, '\t') + '\n');
}

export function loadFixtureBody(fixtureName: string): string {
	const path = join(FIXTURES_DIR, `${fixtureName}.txt`);
	return readFileSync(path, 'utf-8');
}

export function listFixtureNames(): string[] {
	const files = readdirSync(FIXTURES_DIR);
	return files
		.filter((f) => f.endsWith('.expected.json'))
		.map((f) => f.replace('.expected.json', ''));
}
