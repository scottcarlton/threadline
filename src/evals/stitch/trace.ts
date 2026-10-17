import type Anthropic from '@anthropic-ai/sdk';

export type TraceTurn = {
	role: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result';
	content: string;
	name?: string;
};

/** Messages API transcript to the report's Turn[] shape (one turn per tool call and result). */
export function toTrace(
	system: Anthropic.TextBlockParam[],
	messages: Anthropic.MessageParam[]
): TraceTurn[] {
	const out: TraceTurn[] = [{ role: 'system', content: system.map((b) => b.text).join('\n\n') }];
	for (const m of messages) {
		if (typeof m.content === 'string') {
			out.push({ role: m.role, content: m.content });
			continue;
		}
		for (const b of m.content) {
			if (b.type === 'text') out.push({ role: m.role, content: b.text });
			else if (b.type === 'tool_use')
				out.push({ role: 'tool_call', name: b.name, content: JSON.stringify(b.input, null, 2) });
			else if (b.type === 'tool_result')
				out.push({
					role: 'tool_result',
					content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
				});
		}
	}
	return out;
}
