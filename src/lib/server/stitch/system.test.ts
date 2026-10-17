import { describe, it, expect } from 'vitest';
import { buildStitchSystem, type StitchSystemContext } from './system';
import { MAIN_STATIC_PROMPT } from '../ai-prompts';

const base: StitchSystemContext = {
	organizationName: 'Coastline Reps',
	orgType: 'rep',
	userDisplayName: 'Dana Ruiz',
	role: 'owner',
	brandScoped: false,
	pageContext: 'Home',
	entityInfo: '',
	setupInfo: '',
	agentPrompt: null,
	now: new Date('2026-10-16T10:00:00-07:00'),
	timeZone: 'America/Los_Angeles'
};

describe('buildStitchSystem', () => {
	it('puts the cached static prompt first', () => {
		const [first] = buildStitchSystem(base);
		expect(first).toEqual({
			type: 'text',
			text: MAIN_STATIC_PROMPT,
			cache_control: { type: 'ephemeral' }
		});
	});

	it('renders the rep dynamic context exactly as the route did', () => {
		const blocks = buildStitchSystem(base);
		expect(blocks).toHaveLength(2);
		expect(blocks[1]).toEqual({
			type: 'text',
			text: `Current user context:
- Organization: Coastline Reps
- Org type: Rep (sales agency)
- User: Dana Ruiz
- Role: owner
- Brand access: You have access to all brands in the organization.
- Current date/time: Friday, October 16, 2026 at 10:00 AM
- Currently viewing: Home
`
		});
	});

	it('adds the brand-org paragraph and scoped access line', () => {
		const text = (
			buildStitchSystem({ ...base, orgType: 'brand', brandScoped: true })[1] as { text: string }
		).text;
		expect(text).toContain('- Org type: Brand (manufacturer)');
		expect(text).toContain(
			'- Brand access: You are scoped to specific brands only. Only interact with data for your assigned brands.'
		);
		expect(text).toContain('This is a BRAND organization.');
	});

	it('adds the guest read-only paragraph', () => {
		const text = (buildStitchSystem({ ...base, role: 'guest' })[1] as { text: string }).text;
		expect(text).toContain('IMPORTANT: This user has READ-ONLY access.');
	});

	it('appends a custom agent block when given', () => {
		const blocks = buildStitchSystem({ ...base, agentPrompt: 'Be terse.' });
		expect(blocks[2]).toEqual({
			type: 'text',
			text: '\n\nCUSTOM AGENT INSTRUCTIONS:\nBe terse.'
		});
	});
});
