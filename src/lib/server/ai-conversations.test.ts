import { describe, it, expect } from 'vitest';
import { fallbackTitle, normalizeTitle, toHistoryMessages } from './ai-conversations.js';
import type { PlainTurn } from './ai-history.js';

describe('toHistoryMessages', () => {
	it('returns rows as Messages API params in order', () => {
		const rows: PlainTurn[] = [
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' }
		];
		expect(toHistoryMessages(rows)).toEqual([
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' }
		]);
	});

	it('drops a trailing user turn so the live message can be appended', () => {
		const rows: PlainTurn[] = [
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' },
			{ role: 'user', content: 'third' }
		];
		expect(toHistoryMessages(rows)).toEqual([
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'second' }
		]);
	});

	// An attachments-only turn is stored with empty content. Sending it as a
	// turn would be an empty message, which the API rejects.
	it('skips rows with empty content rather than sending an empty turn', () => {
		const rows: PlainTurn[] = [
			{ role: 'user', content: '   ' },
			{ role: 'user', content: 'real' },
			{ role: 'assistant', content: 'reply' }
		];
		expect(toHistoryMessages(rows)).toEqual([
			{ role: 'user', content: 'real' },
			{ role: 'assistant', content: 'reply' }
		]);
	});

	it('returns an empty array for no rows', () => {
		expect(toHistoryMessages([])).toEqual([]);
	});
});

describe('normalizeTitle', () => {
	it('trims whitespace', () => {
		expect(normalizeTitle('  Spring order review  ')).toBe('Spring order review');
	});

	it('strips surrounding quotes the model sometimes adds', () => {
		expect(normalizeTitle('"Spring order review"')).toBe('Spring order review');
	});

	it('strips a trailing period', () => {
		expect(normalizeTitle('Spring order review.')).toBe('Spring order review');
	});

	it('returns null for empty or whitespace-only input', () => {
		expect(normalizeTitle('')).toBeNull();
		expect(normalizeTitle('   ')).toBeNull();
	});

	it('caps an over-long title at 60 characters', () => {
		expect(normalizeTitle('x'.repeat(80))).toHaveLength(60);
	});
});

describe('fallbackTitle', () => {
	it('uses the first user message when short', () => {
		expect(fallbackTitle('Check the Bloom order')).toBe('Check the Bloom order');
	});

	it('truncates a long message to 50 characters with an ellipsis', () => {
		const result = fallbackTitle('x'.repeat(80));
		expect(result).toBe('x'.repeat(50) + '...');
	});

	it('collapses newlines into single spaces', () => {
		expect(fallbackTitle('line one\n\nline two')).toBe('line one line two');
	});

	it('returns null when there is nothing usable', () => {
		expect(fallbackTitle('   ')).toBeNull();
	});
});
