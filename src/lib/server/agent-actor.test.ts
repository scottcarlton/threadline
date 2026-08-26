import { describe, it, expect } from 'vitest';
import { resolveAgentActor } from './agent-actor.js';

const OWNER = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('resolveAgentActor', () => {
	it('uses the admin who configured the agent', () => {
		expect(resolveAgentActor({ created_by: OWNER }, 'agent-1')).toEqual({
			ok: true,
			userId: OWNER
		});
	});

	// The bug this replaces: userId was hard-coded to '' for every agent run,
	// which Postgres rejects on uuid not null columns.
	it('refuses to run rather than falling back to an empty actor', () => {
		const result = resolveAgentActor({ created_by: '' }, 'agent-1');
		expect(result.ok).toBe(false);
	});

	it('refuses when the owner column is null', () => {
		expect(resolveAgentActor({ created_by: null }, 'agent-1').ok).toBe(false);
	});

	it('refuses when the agent row is missing entirely', () => {
		expect(resolveAgentActor(null, 'agent-1').ok).toBe(false);
		expect(resolveAgentActor(undefined, 'agent-1').ok).toBe(false);
	});

	it('refuses a whitespace-only owner id', () => {
		expect(resolveAgentActor({ created_by: '   ' }, 'agent-1').ok).toBe(false);
	});

	it('refuses a non-uuid owner id before it reaches Postgres', () => {
		expect(resolveAgentActor({ created_by: 'system' }, 'agent-1').ok).toBe(false);
	});

	it('accepts an uppercase uuid', () => {
		const result = resolveAgentActor({ created_by: OWNER.toUpperCase() }, 'agent-1');
		expect(result).toMatchObject({ ok: true });
	});

	it('names the agent in the refusal so a failed run is diagnosable', () => {
		const result = resolveAgentActor({ created_by: null }, 'nightly-recap');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('nightly-recap');
	});
});
