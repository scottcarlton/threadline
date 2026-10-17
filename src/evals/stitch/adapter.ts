// src/evals/stitch/adapter.ts
import Anthropic from '@anthropic-ai/sdk';
import { PROMPT_VERSION } from '../../lib/server/ai-prompts.js';
import { buildStitchSystem } from '../../lib/server/stitch/system.js';
import { buildStitchTools } from '../../lib/server/stitch/tools.js';
import { STITCH_MODEL } from '../../lib/server/stitch/turn.js';
import { CLASSIFIER_MODEL, type StitchRoute } from '../../lib/server/stitch/classify.js';
import { CHAT_MODEL } from '../../lib/server/stitch/chat.js';
import { loadStitchCases, type StitchCase } from './schema.js';
import { createScriptedExecutor } from './executor.js';
import { runChecks, type ConversationObservation } from './checks.js';
import { buildJudgeRequest, parseJudge } from './judge.js';
import { runConversation } from './conversation.js';
import { toTrace, type TraceTurn } from './trace.js';

type Usage = {
	input_tokens: number;
	output_tokens: number;
	cache_read_input_tokens: number;
	cache_creation_input_tokens: number;
};
export type RunResult = {
	output: string;
	transcript: TraceTurn[];
	model: string;
	usage: Usage;
	haiku_usage?: Usage;
	stop_reason: string | null;
	status: 'ok' | 'truncated';
	observation: ConversationObservation;
	routes: StitchRoute[];
	tool_calls: number;
	unscripted_calls: number;
	turns: number;
};
type Deps = { client: Anthropic };

let defaultClient: Anthropic | null = null;
const deps = (d?: Deps): Deps => d ?? { client: (defaultClient ??= new Anthropic()) };

function sumUsage(messages: Anthropic.Message[]): Usage {
	const u: Usage = {
		input_tokens: 0,
		output_tokens: 0,
		cache_read_input_tokens: 0,
		cache_creation_input_tokens: 0
	};
	for (const m of messages) {
		u.input_tokens += m.usage.input_tokens ?? 0;
		u.output_tokens += m.usage.output_tokens ?? 0;
		u.cache_read_input_tokens += m.usage.cache_read_input_tokens ?? 0;
		u.cache_creation_input_tokens += m.usage.cache_creation_input_tokens ?? 0;
	}
	return u;
}

function assertModel(m: Anthropic.Message, expected: string) {
	if (!String(m.model).startsWith(expected))
		throw Object.assign(new Error(`Stitch call served by ${m.model}, expected ${expected}`), {
			failure_class: 'serving_substitution'
		});
}

export async function loadCases() {
	const filter = process.env.STITCH_EVAL_CASES?.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return loadStitchCases(filter).map((c) => ({ ...c, prompt: c.turns.join('\n---\n') }));
}

export async function runCase(c: StitchCase, _ctx: unknown, d?: Deps): Promise<RunResult> {
	const { client } = deps(d);
	const system = buildStitchSystem({
		organizationName: c.context.orgName,
		orgType: c.context.orgType,
		userDisplayName: c.context.userName,
		role: c.context.role,
		brandScoped: Boolean(c.context.brandScope),
		pageContext: c.context.page,
		entityInfo: '',
		setupInfo: c.context.setupInfo,
		agentPrompt: null,
		now: new Date(c.now),
		timeZone: c.timeZone
	});
	const executor = createScriptedExecutor(c.tools);
	const live = await runConversation({
		client,
		system,
		tools: buildStitchTools(null),
		history: c.history,
		turns: c.turns,
		role: c.context.role,
		brandScope: c.context.brandScope,
		executeTool: executor.execute
	});

	const sonnet: Anthropic.Message[] = [];
	const haiku: Anthropic.Message[] = [];
	for (const t of live) {
		assertModel(t.classifier, CLASSIFIER_MODEL);
		haiku.push(t.classifier);
		for (const r of t.responses) {
			assertModel(r, t.route === 'CHAT' ? CHAT_MODEL : STITCH_MODEL);
			(t.route === 'CHAT' ? haiku : sonnet).push(r);
		}
	}
	const unscripted = executor.calls.filter((k) => !k.scripted).map((k) => k.name);
	const priorMessages = c.history.map((h) => ({ role: h.role, content: h.content }));

	return {
		output: live.map((t) => t.text).join('\n---\n'),
		transcript: toTrace(system, [...priorMessages, ...live.flatMap((t) => t.transcript)]),
		model: sonnet.length ? sonnet.at(-1)!.model : haiku.at(-1)!.model,
		usage: sumUsage(sonnet.length ? sonnet : haiku),
		haiku_usage: sonnet.length ? sumUsage(haiku) : undefined,
		stop_reason: live.at(-1)!.stopReason,
		status: live.some((t) => t.stopReason === 'max_tokens') ? 'truncated' : 'ok',
		observation: {
			turns: live.map((t) => ({ text: t.text, rawText: t.rawText, attempted: t.attempted })),
			unscripted
		},
		routes: live.map((t) => t.route),
		tool_calls: live.reduce((n, t) => n + t.attempted.length, 0),
		unscripted_calls: unscripted.length,
		turns: live.length
	};
}

export async function gradeCase(
	c: StitchCase,
	run: RunResult,
	_ref: unknown,
	_ctx: unknown,
	d?: Deps
) {
	const grade: Record<string, number> = {};
	const explanation: Record<string, string> = {};
	if (c.expect.routes) {
		const wrong = c.expect.routes
			.map((r, i) => [i, r] as const)
			.filter(([i, r]) => run.routes[i] !== r);
		grade.route = wrong.length ? 0 : 1;
		explanation.route = wrong.length
			? wrong
					.map(([i, r]) => `turn ${i + 1}: classifier said ${run.routes[i]}, expected ${r}`)
					.join('; ')
			: `routes ${run.routes.join(', ')}`;
	}
	for (const [id, r] of Object.entries(runChecks(c, run.observation))) {
		if (!r) continue;
		grade[id] = r.pass ? 1 : 0;
		explanation[id] = r.reason;
	}
	const response = await deps(d).client.messages.create(
		buildJudgeRequest(c, run.transcript, run.routes, run.observation.unscripted)
	);
	const verdict = parseJudge(response);
	for (const [id, v] of Object.entries(verdict)) {
		grade[id] = v.pass ? 1 : 0;
		explanation[id] = v.reason;
	}
	return { grade, explanation, judge_model: response.model, judge_usage: response.usage };
}

export function perfFrom(run: RunResult) {
	return {
		tool_calls: run.tool_calls,
		unscripted_calls: run.unscripted_calls,
		turns: run.turns,
		prompt_version: PROMPT_VERSION,
		...(run.haiku_usage ? { haiku_usage: run.haiku_usage } : {})
	};
}
