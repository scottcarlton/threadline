import { describe, it, expect } from 'vitest';
import { stitchToolDefinitions, WRITE_TOOLS, buildStitchTools } from './tools';
import {
	isToolName,
	toolInputJsonSchema,
	toolSchemas,
	writeToolSchemas
} from '../../schemas/stitch-tools';

describe('stitch tools', () => {
	it('has unique tool names', () => {
		const names = stitchToolDefinitions.map((t) => t.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it('every WRITE_TOOLS entry names a defined tool', () => {
		const names = new Set(stitchToolDefinitions.map((t) => t.name));
		for (const w of WRITE_TOOLS) expect(names.has(w), w).toBe(true);
	});

	it('every write tool has a schema, and every schema is a write tool', () => {
		expect([...WRITE_TOOLS].sort()).toEqual(Object.keys(writeToolSchemas).sort());
	});

	it('every tool has a schema, and every schema has a tool', () => {
		expect(stitchToolDefinitions.map((t) => t.name).sort()).toEqual(
			Object.keys(toolSchemas).sort()
		);
	});

	it('every tool offers the model the input_schema its Zod schema generates', () => {
		for (const tool of stitchToolDefinitions) {
			if (!isToolName(tool.name)) throw new Error(`${tool.name} has no schema`);
			expect(tool.input_schema, tool.name).toEqual(toolInputJsonSchema(toolSchemas[tool.name]));
		}
	});

	it('buildStitchTools(null) returns every tool with cache_control on the last only', () => {
		const tools = buildStitchTools(null);
		expect(tools).toHaveLength(stitchToolDefinitions.length);
		const marked = tools.filter((t) => 'cache_control' in t && t.cache_control);
		expect(marked).toHaveLength(1);
		expect(tools.at(-1)).toHaveProperty('cache_control', { type: 'ephemeral' });
	});

	it('an empty whitelist means all tools', () => {
		expect(buildStitchTools([])).toHaveLength(stitchToolDefinitions.length);
	});

	it('a whitelist filters to the named tools', () => {
		const tools = buildStitchTools(['query_data', 'list_brands']);
		expect(tools.map((t) => t.name).sort()).toEqual(['list_brands', 'query_data']);
	});
});
