import { z } from 'zod';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cases');

const ToolResultSchema = z
	.object({ success: z.boolean(), data: z.unknown().optional(), error: z.string().optional() })
	.strict();

const ToolScriptSchema = z
	.object({
		tool: z.string().min(1),
		match: z.record(z.string(), z.unknown()).default({}),
		result: ToolResultSchema
	})
	.strict();

const Route = z.enum(['CHAT', 'TOOLS']);

export const CaseSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9-]+$/),
		tags: z.array(z.string()).min(1),
		now: z.iso.datetime({ offset: true }),
		timeZone: z.string().default('America/Los_Angeles'),
		context: z
			.object({
				orgName: z.string().min(1),
				orgType: z.enum(['rep', 'brand']),
				userName: z.string().min(1),
				role: z.string().min(1),
				brandScope: z.array(z.string()).nullable(),
				page: z.string().default('Home'),
				setupInfo: z.string().default('')
			})
			.strict(),
		history: z
			.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }).strict())
			.default([]),
		turns: z.array(z.string().min(1)).min(1),
		tools: z.array(ToolScriptSchema).default([]),
		expect: z
			.object({
				routes: z.array(Route).optional(),
				brand_ask: z.boolean().optional(),
				lookup_tools: z.array(z.string()).optional(),
				allowed_writes: z.array(z.string()).optional(),
				confirmed_at: z.record(z.string(), z.number().int().min(0)).optional()
			})
			.strict(),
		rubric: z.string().min(1)
	})
	.strict()
	.superRefine((c, ctx) => {
		if (c.expect.routes && c.expect.routes.length !== c.turns.length)
			ctx.addIssue({ code: 'custom', path: ['expect', 'routes'], message: 'one route per turn' });
		for (const [tool, i] of Object.entries(c.expect.confirmed_at ?? {}))
			if (i >= c.turns.length)
				ctx.addIssue({
					code: 'custom',
					path: ['expect', 'confirmed_at', tool],
					message: 'index past the last turn'
				});
	});

export type StitchCase = z.infer<typeof CaseSchema>;

export function loadStitchCases(filter?: string[]): StitchCase[] {
	const all = readdirSync(CASES_DIR)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.map((f) => CaseSchema.parse(JSON.parse(readFileSync(join(CASES_DIR, f), 'utf-8'))));
	if (!filter || filter.length === 0) return all;
	const missing = filter.filter((id) => !all.some((c) => c.id === id));
	if (missing.length) throw new Error(`unknown case id(s): ${missing.join(', ')}`);
	return all.filter((c) => filter.includes(c.id));
}
