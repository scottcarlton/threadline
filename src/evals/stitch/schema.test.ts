import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CaseSchema, CASES_DIR, loadStitchCases } from './schema';

const files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'));
const read = (f: string) => JSON.parse(readFileSync(join(CASES_DIR, f), 'utf-8'));

describe('Stitch eval cases', () => {
	for (const f of files) {
		it(`${f} validates and its id matches the filename`, () => {
			const parsed = CaseSchema.safeParse(read(f));
			if (!parsed.success)
				expect.fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
			expect(parsed.data.id).toBe(f.replace(/\.json$/, ''));
		});
	}

	it('rejects unknown keys', () => {
		expect(CaseSchema.safeParse({ ...read(files[0]), typo: 1 }).success).toBe(false);
	});

	it('rejects routes whose length differs from turns', () => {
		const c = read('thanks-routes-chat.json');
		expect(CaseSchema.safeParse({ ...c, expect: { routes: ['CHAT', 'CHAT'] } }).success).toBe(
			false
		);
	});

	it('rejects a confirmed_at index past the last turn', () => {
		const c = read('thanks-routes-chat.json');
		expect(
			CaseSchema.safeParse({ ...c, expect: { confirmed_at: { send_email: 3 } } }).success
		).toBe(false);
	});

	it('loadStitchCases filters by id and throws on unknown ids', () => {
		expect(loadStitchCases(['thanks-routes-chat']).map((c) => c.id)).toEqual([
			'thanks-routes-chat'
		]);
		expect(() => loadStitchCases(['nope'])).toThrow(/nope/);
	});
});
