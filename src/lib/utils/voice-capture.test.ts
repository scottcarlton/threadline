import { describe, expect, it } from 'vitest';
import { cleanTranscript, levelFromTimeDomain, levelToBarHeight } from './voice-capture';

describe('cleanTranscript', () => {
	it('strips bracketed and parenthesised artifacts', () => {
		expect(cleanTranscript('[music] hello (cough) there')).toBe('hello  there');
	});

	it('handles empty input', () => {
		expect(cleanTranscript(null)).toBe('');
		expect(cleanTranscript(undefined)).toBe('');
	});
});

describe('levelFromTimeDomain', () => {
	it('is 0 for silence (all samples at 128)', () => {
		expect(levelFromTimeDomain(new Uint8Array(64).fill(128))).toBe(0);
	});

	it('is 0 for an empty buffer', () => {
		expect(levelFromTimeDomain(new Uint8Array(0))).toBe(0);
	});

	it('is ~1 for a full-scale square wave', () => {
		const data = new Uint8Array(64).map((_, i) => (i % 2 ? 0 : 255));
		expect(levelFromTimeDomain(data)).toBeGreaterThan(0.99);
	});
});

describe('levelToBarHeight', () => {
	it('keeps noise under the floor as a dot', () => {
		expect(levelToBarHeight(0)).toBe(2);
		expect(levelToBarHeight(0.005)).toBe(2);
	});

	it('caps at max', () => {
		expect(levelToBarHeight(1)).toBe(24);
	});

	it('grows with loudness', () => {
		expect(levelToBarHeight(0.05)).toBeLessThan(levelToBarHeight(0.15));
	});

	it('respects custom bounds', () => {
		expect(levelToBarHeight(0, 4, 10)).toBe(4);
		expect(levelToBarHeight(1, 4, 10)).toBe(10);
	});
});
