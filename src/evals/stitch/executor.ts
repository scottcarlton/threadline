import type { ToolResult } from '../../lib/server/ai-tools.js';
import type { StitchCase } from './schema.js';

/** Same shape executeToolCall returns for an empty lookup. */
export const UNSCRIPTED_RESULT: ToolResult = { success: true, data: [] };

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Partial deep match. Every key in the pattern must match the input; extra
 * input keys are ignored. Strings match case-insensitively by substring, since
 * the model picks its own casing and may send a fuller name than the case
 * author wrote. Other primitives match exactly; arrays match element-wise.
 */
export function matches(input: unknown, pattern: unknown): boolean {
	if (isObject(pattern)) {
		if (Object.keys(pattern).length === 0) return true;
		if (!isObject(input)) return false;
		return Object.entries(pattern).every(([k, v]) => matches(input[k], v));
	}
	if (Array.isArray(pattern)) {
		return (
			Array.isArray(input) &&
			input.length === pattern.length &&
			pattern.every((v, i) => matches(input[i], v))
		);
	}
	if (typeof pattern === 'string') {
		return typeof input === 'string' && input.toLowerCase().includes(pattern.toLowerCase());
	}
	return input === pattern;
}

export function createScriptedExecutor(scripts: StitchCase['tools']) {
	const calls: Array<{ name: string; input: Record<string, unknown>; scripted: boolean }> = [];
	return {
		calls,
		async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
			const hit = scripts.find((s) => s.tool === name && matches(input, s.match));
			calls.push({ name, input, scripted: Boolean(hit) });
			return structuredClone(hit ? (hit.result as ToolResult) : UNSCRIPTED_RESULT);
		}
	};
}
