// src/lib/server/stitch/turn.ts
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolResult } from '../ai-tools.js';
import { WRITE_TOOLS } from './tools.js';

export const STITCH_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 10;

export type StitchEvent =
	| { type: 'text'; delta: string }
	| { type: 'tool_start'; name: string }
	| { type: 'tool_result'; name: string; ok: boolean };

export type StitchAttempt = { name: string; input: Record<string, unknown>; denied: boolean };

export type StitchTurnResult = {
	text: string;
	rawText: string;
	suggestions?: string[];
	actions: Array<{ tool: string; input: Record<string, unknown>; result: unknown }>;
	attempted: StitchAttempt[];
	responses: Anthropic.Message[];
	stopReason: string | null;
};

/** The slice of the Anthropic client a streamed turn uses, so tests can fake it. */
export type StitchModelClient = {
	messages: {
		stream(params: Anthropic.MessageStreamParams): {
			on(event: 'text', cb: (delta: string) => void): unknown;
			finalMessage(): Promise<Anthropic.Message>;
		};
	};
};

export type RunStitchTurnParams = {
	client: StitchModelClient;
	system: Anthropic.TextBlockParam[];
	tools: Anthropic.Tool[];
	messages: Anthropic.MessageParam[];
	role: string;
	brandScope: string[] | null;
	executeTool: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
	onEvent?: (event: StitchEvent) => void;
	onResponse?: (message: Anthropic.Message) => void;
	model?: string;
};

export function splitSuggestions(text: string): { text: string; suggestions?: string[] } {
	const lines = text.trimEnd().split('\n');
	const lastLine = lines[lines.length - 1];
	if (lastLine?.startsWith('SUGGESTIONS:')) {
		try {
			const suggestions = JSON.parse(lastLine.slice('SUGGESTIONS:'.length));
			return { text: lines.slice(0, -1).join('\n').trimEnd(), suggestions };
		} catch {
			/* leave as-is */
		}
	}
	return { text };
}

const deny = (id: string, error: string): Anthropic.ToolResultBlockParam => ({
	type: 'tool_result',
	tool_use_id: id,
	content: JSON.stringify({ success: false, error })
});

/**
 * One streamed Stitch tool turn: call the model, run the tools it asks for,
 * feed results back, repeat until it stops asking or MAX_TOOL_ITERATIONS model
 * calls are spent. Shared by /api/ai's streaming branch and the Stitch eval.
 */
export async function runStitchTurn(p: RunStitchTurnParams): Promise<StitchTurnResult> {
	const emit = p.onEvent ?? (() => {});
	const actions: StitchTurnResult['actions'] = [];
	const attempted: StitchAttempt[] = [];
	const responses: Anthropic.Message[] = [];
	let rawText = '';
	let stopReason: string | null = null;
	let iteration = 0;

	while (iteration++ < MAX_TOOL_ITERATIONS) {
		const modelStream = p.client.messages.stream({
			model: p.model ?? STITCH_MODEL,
			max_tokens: MAX_TOKENS,
			system: p.system,
			tools: p.tools,
			messages: p.messages
		});
		modelStream.on('text', (delta: string) => {
			rawText += delta;
			emit({ type: 'text', delta });
		});

		const finalMessage = await modelStream.finalMessage();
		responses.push(finalMessage);
		stopReason = finalMessage.stop_reason ?? null;
		p.onResponse?.(finalMessage);

		if (stopReason !== 'tool_use') {
			p.messages.push({ role: 'assistant', content: finalMessage.content });
			break;
		}

		const toolResults: Anthropic.ToolResultBlockParam[] = [];
		for (const block of finalMessage.content) {
			if (block.type !== 'tool_use') continue;
			emit({ type: 'tool_start', name: block.name });
			const toolInput = block.input as Record<string, unknown>;

			if (WRITE_TOOLS.has(block.name) && p.role === 'guest') {
				attempted.push({ name: block.name, input: toolInput, denied: true });
				toolResults.push(deny(block.id, 'Permission denied. Guest users have read-only access.'));
				emit({ type: 'tool_result', name: block.name, ok: false });
				continue;
			}
			if (
				p.brandScope &&
				['update_brand'].includes(block.name) &&
				toolInput.brand_id &&
				!p.brandScope.includes(toolInput.brand_id as string)
			) {
				attempted.push({ name: block.name, input: toolInput, denied: true });
				toolResults.push(deny(block.id, 'Access denied. This brand is outside your scope.'));
				emit({ type: 'tool_result', name: block.name, ok: false });
				continue;
			}

			attempted.push({ name: block.name, input: toolInput, denied: false });
			const result = await p.executeTool(block.name, toolInput);
			actions.push({ tool: block.name, input: toolInput, result });
			toolResults.push({
				type: 'tool_result',
				tool_use_id: block.id,
				content: JSON.stringify(result)
			});
			emit({ type: 'tool_result', name: block.name, ok: result.success !== false });
		}

		p.messages.push({ role: 'assistant', content: finalMessage.content });
		p.messages.push({ role: 'user', content: toolResults });
	}

	const { text, suggestions } = splitSuggestions(rawText);
	return { text, rawText, suggestions, actions, attempted, responses, stopReason };
}
