import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, MESSAGING_TOOLS } from './agent.js';

describe('buildSystemPrompt', () => {
	it('includes the org name and user role', () => {
		const prompt = buildSystemPrompt({
			orgName: 'Acme Reps',
			userName: 'Jane',
			role: 'Owner',
			channel: 'whatsapp'
		});
		expect(prompt).toContain('Acme Reps');
		expect(prompt).toContain('Jane');
		expect(prompt).toContain('Owner');
	});

	it('mentions SMS plain text for sms channel', () => {
		const prompt = buildSystemPrompt({
			orgName: 'Acme Reps',
			userName: 'Jane',
			role: 'Owner',
			channel: 'sms'
		});
		expect(prompt).toContain('plain text');
	});
});

describe('MESSAGING_TOOLS', () => {
	it('includes the core tools', () => {
		const names = MESSAGING_TOOLS.map((t) => t.name);
		expect(names).toContain('place_order');
		expect(names).toContain('lookup_inventory');
		expect(names).toContain('check_order_status');
		expect(names).toContain('search_accounts');
	});
});
