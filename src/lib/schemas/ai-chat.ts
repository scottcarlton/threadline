import { z } from 'zod';

// Body of POST /api/ai. This is the envelope: each field's type, checked
// before the route reads it. The contents of three fields are still judged by
// the helpers that own their rules, which keep their own behavior:
//
// - files: buildAttachmentBlocks (count, size, and type limits, with messages
//   the user can act on)
// - conversationHistory: sanitizeConversationHistory (drops malformed turns
//   and counts them, rather than failing the request)
// - entityContext: sanitizeEntityContext (drops the whole hint when anything
//   is off; a missing hint costs a clarifying question, not the turn)

const attachment = z.object({
	name: z.string().optional(),
	type: z.string(),
	data: z.string()
});

export const aiChatRequestSchema = z.object({
	message: z.string().min(1, 'Message is required'),
	files: z.array(attachment).optional(),
	conversationHistory: z.array(z.unknown()).optional(),
	// null is what the client sends for a new thread.
	conversationId: z.uuid().nullable().optional(),
	currentPage: z.string().optional(),
	entityContext: z.record(z.string(), z.unknown()).optional(),
	// An org_agents id, or 'setup' for the built-in setup agent.
	agentId: z.string().min(1).optional(),
	stream: z.boolean().optional()
});

export type AiChatRequest = z.output<typeof aiChatRequestSchema>;
