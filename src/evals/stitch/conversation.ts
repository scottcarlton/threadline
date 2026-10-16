// src/evals/stitch/conversation.ts
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolResult } from '../../lib/server/ai-tools.js';
import { toHistoryMessages, type PlainTurn } from '../../lib/server/ai-history.js';
import {
	classifyStitchMessage,
	type StitchCreateClient,
	type StitchRoute
} from '../../lib/server/stitch/classify.js';
import { runStitchChatReply } from '../../lib/server/stitch/chat.js';
import {
	runStitchTurn,
	type StitchAttempt,
	type StitchModelClient
} from '../../lib/server/stitch/turn.js';

export type LiveTurn = {
	index: number;
	user: string;
	route: StitchRoute;
	text: string;
	rawText: string;
	suggestions?: string[];
	attempted: StitchAttempt[];
	classifier: Anthropic.Message;
	responses: Anthropic.Message[];
	stopReason: string | null;
	transcript: Anthropic.MessageParam[];
};

/**
 * Drive a conversation the way /api/ai does, one user turn at a time: rebuild
 * text-only history from what was stored, classify, then run the Haiku CHAT
 * reply or the Sonnet tool turn. What is stored per turn matches production:
 * the user message and the suggestions-stripped reply, nothing else, so tool
 * results never carry into later turns.
 */
export async function runConversation(p: {
	client: StitchModelClient & StitchCreateClient;
	system: Anthropic.TextBlockParam[];
	tools: Anthropic.Tool[];
	history: PlainTurn[];
	turns: string[];
	role: string;
	brandScope: string[] | null;
	executeTool: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
}): Promise<LiveTurn[]> {
	const stored: PlainTurn[] = p.history.map((h) => ({ ...h }));
	const out: LiveTurn[] = [];

	for (const [index, user] of p.turns.entries()) {
		const prior = toHistoryMessages(stored);
		const { route, response: classifier } = await classifyStitchMessage({
			client: p.client,
			history: prior,
			message: user
		});
		const messages: Anthropic.MessageParam[] = [...prior, { role: 'user', content: user }];

		let turn: Omit<LiveTurn, 'index' | 'user' | 'route' | 'classifier' | 'transcript'>;
		if (route === 'CHAT') {
			const reply = await runStitchChatReply({ client: p.client, system: p.system, messages });
			messages.push({ role: 'assistant', content: reply.rawText });
			turn = {
				text: reply.text,
				rawText: reply.rawText,
				suggestions: reply.suggestions,
				attempted: [],
				responses: [reply.response],
				stopReason: reply.response.stop_reason
			};
		} else {
			const r = await runStitchTurn({
				client: p.client,
				system: p.system,
				tools: p.tools,
				messages,
				role: p.role,
				brandScope: p.brandScope,
				executeTool: p.executeTool
			});
			turn = {
				text: r.text,
				rawText: r.rawText,
				suggestions: r.suggestions,
				attempted: r.attempted,
				responses: r.responses,
				stopReason: r.stopReason
			};
		}

		out.push({ index, user, route, classifier, transcript: messages.slice(prior.length), ...turn });
		stored.push({ role: 'user', content: user }, { role: 'assistant', content: turn.text });
	}
	return out;
}
