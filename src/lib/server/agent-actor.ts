/**
 * Who an agent acts as when it writes.
 *
 * Agent runs used to pass `userId: ''` into the tool layer, commented "Agent
 * runs as system". Several columns the tools write are `uuid not null`
 * (orders.created_by, buyer_invitations.invited_by, email_log.sent_by), so an
 * empty string is not merely unattributed — Postgres rejects it with 22P02 and
 * the write fails. create_order surfaces that as a tool error; the
 * buyer_invitations insert discarded its result and failed silently.
 *
 * An agent is configured by a human admin (`org_agents.created_by`, itself
 * `uuid not null`), and that person is the accountable owner of anything the
 * agent does. Attributing writes to them is both truthful and satisfies the FK.
 * The distinction between "the admin did this" and "the admin's agent did this"
 * belongs in the audit trail, which records actor_kind separately, not in a
 * fabricated user row.
 */

export type AgentActorRow = { created_by?: string | null } | null | undefined;

export type AgentActorResult = { ok: true; userId: string } | { ok: false; error: string };

/** UUID in any version, case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveAgentActor(agent: AgentActorRow, agentId: string): AgentActorResult {
	const createdBy = agent?.created_by;

	if (typeof createdBy !== 'string' || createdBy.trim() === '') {
		return {
			ok: false,
			error: `Agent ${agentId} has no owner on record, so its writes would have no actor. Refusing to run.`
		};
	}

	if (!UUID_RE.test(createdBy)) {
		return {
			ok: false,
			error: `Agent ${agentId} has a malformed owner id, so its writes would be rejected. Refusing to run.`
		};
	}

	return { ok: true, userId: createdBy };
}
