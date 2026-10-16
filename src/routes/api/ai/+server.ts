import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { executeToolCall } from '$lib/server/ai-tools.js';
import { SETUP_PROMPT } from '$lib/server/ai-prompts.js';
import { logUsage } from '$lib/server/ai-usage.js';
import { buildAttachmentBlocks } from '$lib/server/ai-attachments.js';
import { checkAiLimits } from '$lib/server/ai-limits.js';
import { sanitizeConversationHistory } from '$lib/server/ai-history.js';
import {
	appendMessage,
	conversationBelongsTo,
	createConversation,
	loadHistory,
	type StoredAttachment
} from '$lib/server/ai-conversations.js';
import { generateTitle } from '$lib/server/ai-conversation-title.js';
import { isSafePath, sanitizeEntityContext } from '$lib/server/ai-context.js';
import { WRITE_TOOLS, buildStitchTools } from '$lib/server/stitch/tools.js';
import { buildStitchSystem } from '$lib/server/stitch/system.js';
import { runStitchTurn, STITCH_MODEL } from '$lib/server/stitch/turn.js';
import { classifyStitchMessage, CLASSIFIER_MODEL } from '$lib/server/stitch/classify.js';
import { runStitchChatReply, CHAT_MODEL } from '$lib/server/stitch/chat.js';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function describeCurrentPage(path: string): string {
	if (path === '/') return 'Home';
	if (path === '/dashboard') return 'Buyer dashboard';
	if (path === '/brands') return 'Brands list';
	if (path.match(/^\/brands\/[^/]+\/products\/new/)) return 'Creating a new product';
	if (path.match(/^\/brands\/[^/]+\/products\/[^/]+/)) return 'Viewing a product detail page';
	if (path.match(/^\/brands\/[^/]+\/products/)) return 'Product catalog for a brand';
	if (path.match(/^\/brands\/new/)) return 'Creating a new brand';
	if (path.match(/^\/brands\/[^/]+/)) return 'Viewing a brand detail page';
	if (path === '/accounts') return 'Accounts list';
	if (path.match(/^\/accounts\/new/)) return 'Creating a new account';
	if (path.match(/^\/accounts\/[^/]+/)) return 'Viewing an account detail page';
	if (path === '/orders') return 'Orders list';
	if (path.match(/^\/orders\/new/)) return 'Creating a new order';
	if (path.match(/^\/orders\/[^/]+/)) return 'Viewing an order detail page';
	if (path === '/inbox') return 'Email inbox';
	if (path === '/insight' || path === '/reports') return 'Reports and insights';
	if (path === '/appointments') return 'Appointments calendar';
	if (path.match(/^\/settings/)) return 'Settings';
	if (path.match(/^\/organization/)) return 'Organization settings';
	// Unrecognised but well-formed routes are echoed; anything else is the
	// caller putting their own text into the system prompt. See ai-context.ts.
	return isSafePath(path) ? path : 'Unknown page';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Buyers — retailer-org members and legacy account_users buyers alike — have a
	// session/user/org but must never reach the org AI endpoint.
	if (!locals.session || !locals.user || !locals.organization || locals.isBuyer) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const {
		message,
		files,
		conversationHistory,
		conversationId,
		currentPage,
		entityContext: entityCtx,
		agentId,
		stream
	} = await request.json();
	const origin = request.headers.get('origin') || new URL(request.url).origin;
	const requestStartTime = Date.now();

	if (!message || typeof message !== 'string') {
		return json({ error: 'Message is required' }, { status: 400 });
	}

	const limit = await checkAiLimits(locals.organization.id, locals.user.id, 'chat');
	if (!limit.allowed) {
		locals.audit.record('assistant.rate_limited', {
			status: 'failure',
			errorMessage: limit.scope,
			metadata: { endpoint: 'chat', scope: limit.scope }
		});
		return json(
			{ error: limit.message },
			{ status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
		);
	}

	// Resolve the conversation before anything touches the model, so a forged
	// id fails closed rather than silently starting a new thread. The helpers
	// in ai-conversations.ts run through the admin client and therefore bypass
	// RLS, which is why ownership is checked here rather than relied on from
	// the policy.
	let activeConversationId: string | null;
	let isNewConversation = false;
	if (typeof conversationId === 'string' && conversationId) {
		const owns = await conversationBelongsTo(conversationId, locals.user.id);
		if (!owns) return json({ error: 'Conversation not found' }, { status: 403 });
		activeConversationId = conversationId;
	} else {
		activeConversationId = await createConversation(locals.user.id, locals.organization.id);
		isNewConversation = activeConversationId !== null;
	}

	// Resolve agent — by explicit agentId or @slug mention
	let agentPrompt: string | null = null;
	let resolvedAgentId: string | null = agentId ?? null;
	let cleanMessage = message;

	const slugMatch = message.match(/^@([\w-]+)\s*/);
	let agentToolWhitelist: string[] | null = null;
	if (slugMatch && !resolvedAgentId) {
		const { data: agentBySlug } = await locals.supabase
			.from('org_agents')
			.select('id, system_prompt, tool_whitelist')
			.eq('organization_id', locals.organization.id)
			.eq('slug', slugMatch[1])
			.eq('is_active', true)
			.single();
		if (agentBySlug) {
			resolvedAgentId = agentBySlug.id;
			agentPrompt = agentBySlug.system_prompt;
			agentToolWhitelist = agentBySlug.tool_whitelist;
			cleanMessage = message.slice(slugMatch[0].length);
		}
	}

	// Built-in setup mode — bypass org_agents lookup
	if (resolvedAgentId === 'setup') {
		agentPrompt = SETUP_PROMPT;
	}

	if (resolvedAgentId && !agentPrompt) {
		const { data: agentById } = await locals.supabase
			.from('org_agents')
			.select('system_prompt, tool_whitelist')
			.eq('id', resolvedAgentId)
			.eq('is_active', true)
			.single();
		if (agentById) {
			agentPrompt = agentById.system_prompt;
			agentToolWhitelist = agentById.tool_whitelist;
		}
	}

	// Build multimodal user content if files are attached. Size, count, and type
	// are validated before anything reaches the prompt.
	const attachments = buildAttachmentBlocks(files);
	if (!attachments.ok) {
		return json({ error: attachments.error }, { status: 400 });
	}

	const userContent: string | Anthropic.ContentBlockParam[] = attachments.blocks.length
		? [...attachments.blocks, { type: 'text', text: cleanMessage }]
		: cleanMessage;

	const role = locals.membership?.role ?? 'guest';

	const pageContext = describeCurrentPage(currentPage ?? '/');

	// Dynamic per-request context
	const entity = sanitizeEntityContext(entityCtx);
	const entityInfo = entity?.summary
		? `\n- Entity in view: ${entity.summary}. The user is currently looking at this ${entity.type} — use this context to answer questions without requiring them to re-specify which ${entity.type} they mean.`
		: '';

	// Check setup state for new rep orgs.
	// All four counts rely on RLS so federation visibility counts: a rep connected
	// to a brand org that already has brands/products/accounts is NOT a new workspace,
	// even if they haven't created their own data yet. Orders are always rep-owned,
	// but we keep the default (RLS also returns own-org orders for reps).
	let setupInfo = '';
	if (locals.orgType === 'rep') {
		const [brandCheck, productCheck, accountCheck, orderCheck] = await Promise.all([
			locals.supabase
				.from('brands')
				.select('id', { count: 'exact', head: true })
				.eq('is_active', true),
			locals.supabase
				.from('products')
				.select('id', { count: 'exact', head: true })
				.eq('is_active', true),
			locals.supabase
				.from('accounts')
				.select('id', { count: 'exact', head: true })
				.eq('is_active', true),
			locals.supabase.from('orders').select('id', { count: 'exact', head: true })
		]);
		const hasBrands = (brandCheck.count ?? 0) > 0;
		const hasProducts = (productCheck.count ?? 0) > 0;
		const hasAccounts = (accountCheck.count ?? 0) > 0;
		const hasOrders = (orderCheck.count ?? 0) > 0;
		if (!hasBrands || !hasProducts || !hasAccounts || !hasOrders) {
			const missing = [];
			if (!hasBrands) missing.push('add a brand (the fashion labels they represent)');
			if (!hasProducts) missing.push('add products to a brand (their product catalog)');
			if (!hasAccounts) missing.push('create an account (retail buyers/stores they sell to)');
			if (!hasOrders) missing.push('create their first order');
			setupInfo = `\nNEW USER SETUP: This is a new workspace still being set up. The user still needs to: ${missing.join(', ')}. If they ask what to do or how to get started, guide them through these steps in order. You can help them create brands, accounts, and orders using your tools.`;
		}
	}

	const systemBlocks = buildStitchSystem({
		organizationName: locals.organization.name,
		orgType: locals.orgType,
		userDisplayName: locals.user.display_name,
		role,
		brandScoped: Boolean(locals.brandScope),
		pageContext,
		entityInfo,
		setupInfo,
		agentPrompt,
		now: new Date()
	});

	const cachedTools = buildStitchTools(agentToolWhitelist);

	try {
		// For an existing conversation, history comes from rows this server
		// wrote, so the forgery vector ai-history.ts guards against does not
		// apply. The sanitizer stays for the first turn of a new conversation
		// and as a fallback when the conversation row could not be created.
		let historyMessages: Anthropic.MessageParam[];
		if (activeConversationId && !isNewConversation) {
			historyMessages = await loadHistory(activeConversationId);
		} else {
			const history = sanitizeConversationHistory(conversationHistory);
			if (history.rejected > 0) {
				console.warn(
					`[ai] discarded ${history.rejected} malformed history turn(s) from user ${locals.user!.id}`
				);
			}
			historyMessages = history.messages;
		}
		const messages: Anthropic.MessageParam[] = [
			...historyMessages,
			{ role: 'user' as const, content: userContent }
		];

		// Persist the user turn before the model call. Attachment bytes are never
		// stored, only enough metadata to render the turn on resume.
		if (activeConversationId) {
			const storedAttachments: StoredAttachment[] | null = Array.isArray(files)
				? files.map((f: { name: string; type: string; data: string }) => ({
						name: f.name,
						type: f.type,
						size: f.data?.length ?? 0
					}))
				: null;
			await appendMessage(
				activeConversationId,
				'user',
				cleanMessage,
				storedAttachments && storedAttachments.length > 0 ? storedAttachments : null
			);
		}

		// Pre-flight: use Haiku to classify whether this needs tools/Sonnet or can be answered directly.
		// Skip classification if files are attached (needs Sonnet vision) or a custom agent is active.
		const needsClassification = typeof userContent === 'string' && !agentPrompt;
		let useHaiku = false;

		if (needsClassification) {
			const { route } = await classifyStitchMessage({
				client: anthropic,
				history: historyMessages,
				message: userContent as string,
				onResponse: (response) =>
					logUsage({
						endpoint: 'chat',
						purpose: 'classifier',
						model: CLASSIFIER_MODEL,
						organizationId: locals.organization!.id,
						userId: locals.user!.id,
						response
					})
			});
			useHaiku = route === 'CHAT';
		}

		if (useHaiku) {
			// Simple conversational response — Haiku without tools
			const reply = await runStitchChatReply({
				client: anthropic,
				system: systemBlocks,
				messages,
				onResponse: (response) =>
					logUsage({
						endpoint: 'chat',
						purpose: 'chat',
						model: CHAT_MODEL,
						organizationId: locals.organization!.id,
						userId: locals.user!.id,
						response
					})
			});
			const responseText = reply.text;
			const suggestions = reply.suggestions;

			if (activeConversationId) {
				await appendMessage(activeConversationId, 'assistant', responseText);
				if (isNewConversation) {
					generateTitle({
						anthropic,
						conversationId: activeConversationId,
						firstUserMessage: cleanMessage,
						firstAssistantMessage: responseText,
						organizationId: locals.organization!.id,
						userId: locals.user!.id
					});
				}
			}

			return json({ response: responseText, suggestions, conversationId: activeConversationId });
		}

		// Streaming branch: return Server-Sent Events so the client can render
		// text deltas and tool progress as they arrive instead of waiting for
		// the full multi-iteration tool loop to finish.
		if (stream === true) {
			return streamResponse({
				anthropic,
				systemBlocks,
				cachedTools,
				messages,
				locals,
				role,
				origin,
				resolvedAgentId,
				cleanMessage,
				requestStartTime,
				conversationId: activeConversationId,
				isNewConversation
			});
		}

		let response = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 4096,
			system: systemBlocks,
			tools: cachedTools,
			messages
		});
		logUsage({
			endpoint: 'chat',
			purpose: 'tools',
			model: 'claude-sonnet-4-6',
			organizationId: locals.organization!.id,
			userId: locals.user!.id,
			response
		});

		const actions: Array<{ tool: string; input: Record<string, unknown>; result: unknown }> = [];
		const MAX_TOOL_ITERATIONS = 10;
		let toolIterations = 0;

		// Handle tool use loop (Claude may call multiple tools in sequence)
		while (response.stop_reason === 'tool_use' && toolIterations++ < MAX_TOOL_ITERATIONS) {
			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const block of response.content) {
				if (block.type !== 'tool_use') continue;

				const toolUse = block;

				// Check write permission
				if (WRITE_TOOLS.has(toolUse.name) && role === 'guest') {
					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							success: false,
							error: 'Permission denied. Guest users have read-only access.'
						})
					});
					continue;
				}

				const toolInput = toolUse.input as Record<string, unknown>;

				// Check brand scope for brand-specific write ops
				if (
					locals.brandScope &&
					['update_brand'].includes(toolUse.name) &&
					toolInput.brand_id &&
					!locals.brandScope.includes(toolInput.brand_id as string)
				) {
					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							success: false,
							error: 'Access denied. This brand is outside your scope.'
						})
					});
					continue;
				}

				const result = await executeToolCall(toolUse.name, toolInput, {
					supabase: locals.supabase,
					organizationId: locals.organization!.id,
					userId: locals.user!.id,
					brandScope: locals.brandScope,
					trust: 'interactive',
					orgType: locals.orgType === 'brand' ? 'brand' : 'rep',
					origin
				});

				actions.push({ tool: toolUse.name, input: toolInput, result });

				toolResults.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: JSON.stringify(result)
				});
			}

			// Send tool results back to Claude
			messages.push({ role: 'assistant' as const, content: response.content });
			messages.push({ role: 'user' as const, content: toolResults });

			response = await anthropic.messages.create({
				model: 'claude-sonnet-4-6',
				max_tokens: 4096,
				system: systemBlocks,
				tools: cachedTools,
				messages
			});
			logUsage({
				endpoint: 'chat',
				purpose: 'tools',
				model: 'claude-sonnet-4-6',
				organizationId: locals.organization!.id,
				userId: locals.user!.id,
				response
			});
		}

		// Extract final text response
		const textBlocks = response.content.filter(
			(block): block is Anthropic.TextBlock => block.type === 'text'
		);
		let responseText = textBlocks.map((b) => b.text).join('\n');

		// Parse out suggestions from the last line
		let suggestions: string[] | undefined;
		const lines = responseText.trimEnd().split('\n');
		const lastLine = lines[lines.length - 1];
		if (lastLine?.startsWith('SUGGESTIONS:')) {
			try {
				suggestions = JSON.parse(lastLine.slice('SUGGESTIONS:'.length));
				responseText = lines.slice(0, -1).join('\n').trimEnd();
			} catch {
				// If parsing fails, leave response as-is
			}
		}

		// Log agent run if this was an agent invocation
		if (resolvedAgentId) {
			const toolNames = actions.map((a) => a.tool);
			await locals.supabase.from('org_agent_runs').insert({
				agent_id: resolvedAgentId,
				organization_id: locals.organization!.id,
				triggered_by: 'user',
				input_prompt: cleanMessage,
				output_text: responseText,
				tools_used: toolNames.length > 0 ? toolNames : null,
				status: 'completed',
				completed_at: new Date().toISOString(),
				duration_ms: Date.now() - requestStartTime
			});
		}

		// The prompt is the useful part when troubleshooting a Stitch complaint.
		// It passes through the audit redactor, which caps length and masks
		// PII-shaped values, so it is safe to keep.
		locals.audit.record('assistant.queried', {
			subjectId: resolvedAgentId ?? undefined,
			metadata: {
				prompt: cleanMessage,
				tools_used: actions.map((a) => a.tool),
				agent_id: resolvedAgentId ?? null,
				duration_ms: Date.now() - requestStartTime
			}
		});

		if (activeConversationId) {
			await appendMessage(activeConversationId, 'assistant', responseText);
			if (isNewConversation) {
				generateTitle({
					anthropic,
					conversationId: activeConversationId,
					firstUserMessage: cleanMessage,
					firstAssistantMessage: responseText,
					organizationId: locals.organization!.id,
					userId: locals.user!.id
				});
			}
		}

		return json({
			response: responseText,
			actions: actions.length > 0 ? actions : undefined,
			suggestions,
			conversationId: activeConversationId
		});
	} catch (err) {
		console.error('AI API error:', err);
		const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
		locals.audit.record('assistant.queried', {
			status: 'failure',
			errorMessage,
			metadata: { prompt: cleanMessage, duration_ms: Date.now() - requestStartTime }
		});
		return json({ error: errorMessage }, { status: 500 });
	}
};

type StreamResponseParams = {
	anthropic: Anthropic;
	systemBlocks: Anthropic.TextBlockParam[];
	cachedTools: Anthropic.Tool[];
	messages: Anthropic.MessageParam[];
	locals: App.Locals;
	role: string;
	origin: string;
	resolvedAgentId: string | null;
	cleanMessage: string;
	requestStartTime: number;
	conversationId: string | null;
	isNewConversation: boolean;
};

function streamResponse(params: StreamResponseParams): Response {
	const encoder = new TextEncoder();
	const send = (controller: ReadableStreamDefaultController, payload: unknown) => {
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
	};

	const stream = new ReadableStream({
		async start(controller) {
			try {
				const turn = await runStitchTurn({
					client: params.anthropic,
					system: params.systemBlocks,
					tools: params.cachedTools,
					messages: params.messages,
					role: params.role,
					brandScope: params.locals.brandScope ?? null,
					executeTool: (name, input) =>
						executeToolCall(name, input, {
							supabase: params.locals.supabase,
							organizationId: params.locals.organization!.id,
							userId: params.locals.user!.id,
							brandScope: params.locals.brandScope,
							trust: 'interactive',
							orgType: params.locals.orgType === 'brand' ? 'brand' : 'rep',
							origin: params.origin
						}),
					onEvent: (event) => send(controller, event),
					onResponse: (response) =>
						logUsage({
							endpoint: 'chat',
							purpose: 'tools',
							model: STITCH_MODEL,
							organizationId: params.locals.organization!.id,
							userId: params.locals.user!.id,
							response
						})
				});
				const responseText = turn.text;
				const suggestions = turn.suggestions;
				const actions = turn.actions;

				if (params.resolvedAgentId) {
					const toolNames = actions.map((a) => a.tool);
					await params.locals.supabase.from('org_agent_runs').insert({
						agent_id: params.resolvedAgentId,
						organization_id: params.locals.organization!.id,
						triggered_by: 'user',
						input_prompt: params.cleanMessage,
						output_text: responseText,
						tools_used: toolNames.length > 0 ? toolNames : null,
						status: 'completed',
						completed_at: new Date().toISOString(),
						duration_ms: Date.now() - params.requestStartTime
					});
				}

				if (params.conversationId) {
					await appendMessage(params.conversationId, 'assistant', responseText);
					if (params.isNewConversation) {
						generateTitle({
							anthropic: params.anthropic,
							conversationId: params.conversationId,
							firstUserMessage: params.cleanMessage,
							firstAssistantMessage: responseText,
							organizationId: params.locals.organization!.id,
							userId: params.locals.user!.id
						});
					}
				}

				send(controller, {
					type: 'done',
					response: responseText,
					actions: actions.length > 0 ? actions : undefined,
					suggestions,
					conversationId: params.conversationId
				});
			} catch (err) {
				console.error('AI stream error:', err);
				const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
				send(controller, { type: 'error', error: errorMessage });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
}
