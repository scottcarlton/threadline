import { describe, it, expect } from 'vitest';
import { buildConversationHistory, shouldExpireSession } from './session.js';
import type { ConversationMessage } from './types.js';

describe('shouldExpireSession', () => {
	it('returns false for a session updated recently', () => {
		const updatedAt = new Date().toISOString();
		expect(shouldExpireSession(updatedAt, 30)).toBe(false);
	});

	it('returns true for a session updated 31 minutes ago', () => {
		const updatedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
		expect(shouldExpireSession(updatedAt, 30)).toBe(true);
	});
});

describe('buildConversationHistory', () => {
	it('formats conversation history for Claude messages array', () => {
		const history: ConversationMessage[] = [
			{
				role: 'user',
				content: 'Order 3 M Classic Tee for Bloom',
				timestamp: '2026-01-01T00:00:00Z'
			},
			{ role: 'assistant', content: 'Which brand?', timestamp: '2026-01-01T00:00:01Z' }
		];
		const messages = buildConversationHistory(history);
		expect(messages).toEqual([
			{ role: 'user', content: 'Order 3 M Classic Tee for Bloom' },
			{ role: 'assistant', content: 'Which brand?' }
		]);
	});

	it('returns empty array for empty history', () => {
		expect(buildConversationHistory([])).toEqual([]);
	});
});
