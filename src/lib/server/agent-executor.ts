import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { executeToolCall } from './ai-tools.js';
import { supabaseAdmin } from './supabase.js';
import { agentBasePrompt } from './ai-prompts.js';
import { createTracked } from './ai-usage.js';
import { resolveAgentActor } from './agent-actor.js';
import { stitchToolDefinitions } from './stitch/tools.js';
import { reportAiDegraded, reportAiError } from './ai-errors.js';
import { logToolInvalid, trackedToolExecutor } from './stitch/telemetry.js';
import { checkToolInput } from '../schemas/stitch-tools.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface AgentExecutionParams {
	agentId: string;
	orgId: string;
	prompt: string;
	systemPrompt: string;
	triggeredBy: 'user' | 'event' | 'schedule';
	triggerId?: string;
	eventContext?: Record<string, unknown>;
	toolWhitelist?: string[] | null;
}

interface AgentExecutionResult {
	output: string;
	toolsUsed: string[];
	runId: string;
}

export async function executeAgent(params: AgentExecutionParams): Promise<AgentExecutionResult> {
	const startTime = Date.now();
	const toolsUsed: string[] = [];

	// Create run record
	const { data: run } = await supabaseAdmin
		.from('org_agent_runs')
		.insert({
			agent_id: params.agentId,
			organization_id: params.orgId,
			trigger_id: params.triggerId ?? null,
			triggered_by: params.triggeredBy,
			input_prompt: params.prompt,
			status: 'running'
		})
		.select()
		.single();

	const runId = run?.id;
	// One run is one turn; reusing the run id lets telemetry join to
	// org_agent_runs directly.
	const turnId: string = runId ?? randomUUID();

	try {
		// Get org info for context
		const { data: org } = await supabaseAdmin
			.from('organizations')
			.select('name, org_type')
			.eq('id', params.orgId)
			.single();

		// Resolve who this agent writes as. See agent-actor.ts for why this is
		// the configuring admin rather than a synthetic system user.
		const { data: agentRow } = await supabaseAdmin
			.from('org_agents')
			.select('created_by')
			.eq('id', params.agentId)
			.single();

		const actor = resolveAgentActor(
			agentRow as { created_by?: string | null } | null,
			params.agentId
		);
		if (!actor.ok) throw new Error(actor.error);

		const eventInfo = params.eventContext ? JSON.stringify(params.eventContext) : undefined;
		const systemBlocks: Anthropic.TextBlockParam[] = [
			{
				type: 'text',
				text: agentBasePrompt(org?.name ?? 'an organization', params.systemPrompt, eventInfo)
			}
		];

		const whitelist = params.toolWhitelist ?? null;
		const agentTools =
			whitelist && whitelist.length > 0
				? stitchToolDefinitions.filter((t) => whitelist.includes(t.name))
				: stitchToolDefinitions;

		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.prompt }];

		let response = await createTracked(
			anthropic,
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 4096,
				system: systemBlocks,
				tools: agentTools,
				messages
			},
			{
				endpoint: 'agent',
				purpose: 'agent',
				organizationId: params.orgId,
				turnId
			}
		);

		// Every tool call this run makes lands in ai_tool_calls under the run's turn.
		const toolCtx = {
			endpoint: 'agent',
			organizationId: params.orgId,
			userId: actor.userId,
			turnId
		};
		const runTool = trackedToolExecutor(
			(name, input) =>
				executeToolCall(name, input, {
					supabase: supabaseAdmin,
					organizationId: params.orgId,
					userId: actor.userId, // the admin who configured this agent
					brandScope: null, // Full access
					// Scheduled and event-triggered runs can carry content we did
					// not author, so they cannot confirm, ship, or cancel an order.
					trust: 'automated',
					orgType: (org?.org_type as 'rep' | 'brand') ?? 'rep',
					origin: ''
				}),
			toolCtx
		);

		// Tool use loop
		const MAX_TOOL_ITERATIONS = 10;
		let toolIterations = 0;
		while (response.stop_reason === 'tool_use' && toolIterations++ < MAX_TOOL_ITERATIONS) {
			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const block of response.content) {
				if (block.type !== 'tool_use') continue;

				const toolInput = block.input as Record<string, unknown>;
				toolsUsed.push(block.name);

				// Same check runStitchTurn makes: a bad input goes back to the model
				// as an error to correct, and is recorded as invalid, not as a failure.
				const checked = checkToolInput(block.name, toolInput);
				if (!checked.success) {
					logToolInvalid(toolCtx, block.name, checked.error);
					toolResults.push({
						type: 'tool_result',
						tool_use_id: block.id,
						is_error: true,
						content: checked.error
					});
					continue;
				}

				const result = await runTool(block.name, checked.data);

				toolResults.push({
					type: 'tool_result',
					tool_use_id: block.id,
					content: JSON.stringify(result)
				});
			}

			messages.push({ role: 'assistant', content: response.content });
			messages.push({ role: 'user', content: toolResults });

			response = await createTracked(
				anthropic,
				{
					model: 'claude-sonnet-4-6',
					max_tokens: 4096,
					system: systemBlocks,
					tools: agentTools,
					messages
				},
				{
					endpoint: 'agent',
					purpose: 'agent',
					organizationId: params.orgId,
					turnId
				}
			);
		}

		// The loop only leaves on tool_use when it ran out of iterations; the
		// output below is whatever partial text the model had, so say so.
		if (response.stop_reason === 'tool_use') {
			reportAiDegraded('iteration_cap', {
				endpoint: 'agent',
				purpose: params.triggeredBy,
				organizationId: params.orgId,
				extra: { agentId: params.agentId, runId: runId ?? null, turnId }
			});
		}

		// Extract text
		const textBlocks = response.content.filter(
			(block): block is Anthropic.TextBlock => block.type === 'text'
		);
		let output = textBlocks.map((b) => b.text).join('\n');

		// Strip suggestions line if present
		const lines = output.trimEnd().split('\n');
		const lastLine = lines[lines.length - 1];
		if (lastLine?.startsWith('SUGGESTIONS:')) {
			output = lines.slice(0, -1).join('\n').trimEnd();
		}

		const duration = Date.now() - startTime;

		// Update run record
		if (runId) {
			await supabaseAdmin
				.from('org_agent_runs')
				.update({
					output_text: output,
					tools_used: toolsUsed,
					status: 'completed',
					completed_at: new Date().toISOString(),
					duration_ms: duration
				})
				.eq('id', runId);
		}

		return { output, toolsUsed, runId: runId ?? '' };
	} catch (err) {
		const duration = Date.now() - startTime;
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';

		// Reported here rather than by the callers (cron, event triggers) because
		// only this frame knows which agent and run failed.
		reportAiError(err, {
			endpoint: 'agent',
			purpose: params.triggeredBy,
			organizationId: params.orgId,
			extra: { agentId: params.agentId, triggerId: params.triggerId ?? null, runId: runId ?? null }
		});

		if (runId) {
			await supabaseAdmin
				.from('org_agent_runs')
				.update({
					status: 'failed',
					error_message: errorMessage,
					completed_at: new Date().toISOString(),
					duration_ms: duration
				})
				.eq('id', runId);
		}

		throw err;
	}
}
