// src/lib/server/stitch/telemetry.ts
import type Anthropic from '@anthropic-ai/sdk';
import { logUsage, logUsageFailure } from '../ai-usage.js';
import { logToolCall } from '../ai-tool-calls.js';
import type { ToolResult } from '../ai-tools.js';
import type { StitchModelClient, StitchDenialReason } from './turn.js';
import type { StitchCreateClient } from './classify.js';

/** Who and what a turn's telemetry rows belong to. */
export type TurnContext = {
	/** ai_usage_logs / ai_tool_calls endpoint vocabulary: 'chat', 'agent', 'messaging-agent'. */
	endpoint: string;
	organizationId: string;
	userId: string | null;
	turnId: string;
	conversationId?: string | null;
};

/**
 * An Anthropic client that writes one ai_usage_logs row per model call: turn
 * id, latency, stop reason, and a failure row when the call throws. Exposes
 * only the slices the Stitch modules use, so it drops in for `client` in
 * runStitchTurn, runStitchChatReply, and classifyStitchMessage.
 *
 * One instance per purpose ('tools', 'chat', 'classifier'), all sharing the
 * turn's context.
 */
export function trackedClient(
	anthropic: Pick<Anthropic, 'messages'>,
	ctx: TurnContext & { purpose: string }
): StitchModelClient & StitchCreateClient {
	const usage = {
		endpoint: ctx.endpoint,
		purpose: ctx.purpose,
		organizationId: ctx.organizationId,
		userId: ctx.userId,
		turnId: ctx.turnId,
		conversationId: ctx.conversationId ?? null
	};

	return {
		messages: {
			async create(params: Anthropic.MessageCreateParamsNonStreaming) {
				const started = Date.now();
				try {
					const response = await anthropic.messages.create(params);
					logUsage({ ...usage, model: params.model, response, latencyMs: Date.now() - started });
					return response;
				} catch (err) {
					logUsageFailure({
						...usage,
						model: params.model,
						error: err,
						latencyMs: Date.now() - started
					});
					throw err;
				}
			},

			stream(params: Anthropic.MessageStreamParams) {
				const started = Date.now();
				const inner = anthropic.messages.stream(params);
				const wrapper = {
					on(event: 'text', cb: (delta: string) => void) {
						inner.on(event, cb);
						return wrapper;
					},
					async finalMessage() {
						try {
							const response = await inner.finalMessage();
							logUsage({
								...usage,
								model: params.model,
								response,
								latencyMs: Date.now() - started
							});
							return response;
						} catch (err) {
							logUsageFailure({
								...usage,
								model: params.model,
								error: err,
								latencyMs: Date.now() - started
							});
							throw err;
						}
					}
				};
				return wrapper;
			}
		}
	};
}

/**
 * Wrap a tool executor so every call lands in ai_tool_calls: ok, error (a
 * `success: false` result, or a throw), with latency. A throw is rethrown
 * unchanged so the turn fails the way it always has.
 */
export function trackedToolExecutor(
	execute: (name: string, input: Record<string, unknown>) => Promise<ToolResult>,
	ctx: TurnContext
): (name: string, input: Record<string, unknown>) => Promise<ToolResult> {
	return async (name, input) => {
		const started = Date.now();
		try {
			const result = await execute(name, input);
			const failed = result.success === false;
			logToolCall({
				...ctx,
				tool: name,
				status: failed ? 'error' : 'ok',
				error: failed ? (result.error ?? 'Tool reported failure') : null,
				latencyMs: Date.now() - started
			});
			return result;
		} catch (err) {
			logToolCall({
				...ctx,
				tool: name,
				status: 'error',
				error: err,
				latencyMs: Date.now() - started
			});
			throw err;
		}
	};
}

/** Record a tool call refused before it ran, for runStitchTurn's onDenied. */
export function logToolDenial(ctx: TurnContext, tool: string, reason: StitchDenialReason): void {
	logToolCall({ ...ctx, tool, status: 'denied', denialReason: reason });
}

/** Record a tool call whose input failed its schema, for runStitchTurn's onInvalid. */
export function logToolInvalid(ctx: TurnContext, tool: string, error: string): void {
	logToolCall({ ...ctx, tool, status: 'invalid', error });
}
