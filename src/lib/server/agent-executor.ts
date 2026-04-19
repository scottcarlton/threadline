import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { executeToolCall } from './ai-tools.js';
import { supabaseAdmin } from './supabase.js';
import { agentBasePrompt } from './ai-prompts.js';
import { logUsage } from './ai-usage.js';

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

	try {
		// Get org info for context
		const { data: org } = await supabaseAdmin
			.from('organizations')
			.select('name')
			.eq('id', params.orgId)
			.single();

		const eventInfo = params.eventContext ? JSON.stringify(params.eventContext) : undefined;
		const systemBlocks: Anthropic.TextBlockParam[] = [
			{
				type: 'text',
				text: agentBasePrompt(org?.name ?? 'an organization', params.systemPrompt, eventInfo)
			}
		];

		// Import tool definitions from the AI endpoint
		// We reuse the same tools but call them with the admin client
		const { _toolDefinitions } = await import('../../routes/api/ai/+server.js');

		const whitelist = params.toolWhitelist ?? null;
		const agentTools =
			whitelist && whitelist.length > 0
				? _toolDefinitions.filter((t) => whitelist.includes(t.name))
				: _toolDefinitions;

		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.prompt }];

		let response = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 4096,
			system: systemBlocks,
			tools: agentTools,
			messages
		});
		logUsage({
			endpoint: 'agent',
			purpose: 'agent',
			model: 'claude-sonnet-4-6',
			organizationId: params.orgId,
			response
		});

		// Tool use loop
		const MAX_TOOL_ITERATIONS = 10;
		let toolIterations = 0;
		while (response.stop_reason === 'tool_use' && toolIterations++ < MAX_TOOL_ITERATIONS) {
			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const block of response.content) {
				if (block.type !== 'tool_use') continue;

				const toolInput = block.input as Record<string, unknown>;
				toolsUsed.push(block.name);

				const result = await executeToolCall(block.name, toolInput, {
					supabase: supabaseAdmin,
					organizationId: params.orgId,
					userId: '', // Agent runs as system
					brandScope: null, // Full access
					orgType: 'rep', // Default for automated agents
					origin: ''
				});

				toolResults.push({
					type: 'tool_result',
					tool_use_id: block.id,
					content: JSON.stringify(result)
				});
			}

			messages.push({ role: 'assistant', content: response.content });
			messages.push({ role: 'user', content: toolResults });

			response = await anthropic.messages.create({
				model: 'claude-sonnet-4-6',
				max_tokens: 4096,
				system: systemBlocks,
				tools: agentTools,
				messages
			});
			logUsage({
				endpoint: 'agent',
				purpose: 'agent',
				model: 'claude-sonnet-4-6',
				organizationId: params.orgId,
				response
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
