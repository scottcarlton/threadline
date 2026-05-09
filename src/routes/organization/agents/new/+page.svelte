<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import {
		AGENT_TEMPLATES,
		getTemplate,
		TOOL_CATALOG,
		ALL_TOOL_NAMES
	} from '$lib/agent-templates.js';

	let { data } = $props();

	let name = $state('');
	let slug = $state('');
	let description = $state('');
	let systemPrompt = $state('');
	let selectedTemplate = $state('');
	let restrictTools = $state(false);
	let allowedTools = $state<string[]>([...ALL_TOOL_NAMES]);
	let error = $state('');
	let loading = $state(false);
	let slugEdited = $state(false);

	function generateSlug(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}

	function handleNameChange() {
		if (!slugEdited) {
			slug = generateSlug(name);
		}
	}

	function handleSlugInput() {
		slugEdited = true;
	}

	function applyTemplate() {
		if (!selectedTemplate) return;
		const template = getTemplate(selectedTemplate);
		if (!template) return;
		name = template.name;
		slug = template.slug;
		slugEdited = true;
		description = template.description;
		systemPrompt = template.system_prompt;
		restrictTools = template.suggested_tools.length > 0;
		allowedTools = restrictTools ? [...template.suggested_tools] : [...ALL_TOOL_NAMES];
	}

	function toggleTool(toolName: string, checked: boolean) {
		if (checked) {
			if (!allowedTools.includes(toolName)) allowedTools = [...allowedTools, toolName];
		} else {
			allowedTools = allowedTools.filter((t) => t !== toolName);
		}
	}

	async function handleCreate() {
		if (!name || !systemPrompt) {
			error = 'Name and system prompt are required.';
			return;
		}
		if (!slug) {
			slug = generateSlug(name);
		}

		error = '';
		loading = true;

		const { data: agent, error: err } = await supabase
			.from('org_agents')
			.insert({
				organization_id: data.organization?.id,
				name,
				slug,
				description: description || null,
				system_prompt: systemPrompt,
				tool_whitelist: restrictTools ? allowedTools : null,
				created_by: data.user?.id
			})
			.select()
			.single();

		loading = false;

		if (err) {
			error = err.message.includes('unique')
				? 'An agent with that slug already exists.'
				: err.message;
		} else if (agent) {
			goto(resolve(`/organization/agents/${agent.id}`));
		}
	}
</script>

<div class="max-w-2xl space-y-6">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" href="/organization/agents"
			><LongArrow direction="left" /> Back</Button
		>
		<h2 class="text-lg font-semibold">New Agent</h2>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Start from template</CardTitle>
		</CardHeader>
		<CardContent class="space-y-3">
			<p class="text-sm text-muted-foreground">
				Pick a template to pre-fill the form below, or start from scratch.
			</p>
			<div class="flex items-center gap-2">
				<select
					bind:value={selectedTemplate}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
				>
					<option value="">— none (start from scratch) —</option>
					{#each AGENT_TEMPLATES as template (template.slug)}
						<option value={template.slug}>{template.name}</option>
					{/each}
				</select>
				<Button variant="outline" onclick={applyTemplate} disabled={!selectedTemplate}>
					Apply
				</Button>
			</div>
			{#if selectedTemplate}
				{@const template = getTemplate(selectedTemplate)}
				{#if template}
					<p class="text-sm text-muted-foreground">{template.description}</p>
				{/if}
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Agent Details</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if error}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			<div class="space-y-2">
				<Label for="name">Name *</Label>
				<Input
					id="name"
					bind:value={name}
					oninput={handleNameChange}
					placeholder="e.g. Reorder Bot"
				/>
			</div>

			<div class="space-y-2">
				<Label for="slug">Slug</Label>
				<div class="flex items-center gap-2">
					<span class="text-sm text-muted-foreground">@</span>
					<Input id="slug" bind:value={slug} oninput={handleSlugInput} placeholder="reorder-bot" />
				</div>
				<p class="text-sm text-muted-foreground">
					Used to invoke the agent from chat with @{slug || 'slug'}
				</p>
			</div>

			<div class="space-y-2">
				<Label for="description">Description</Label>
				<Input id="description" bind:value={description} placeholder="What does this agent do?" />
			</div>

			<div class="space-y-2">
				<Label for="system-prompt">System Prompt *</Label>
				<textarea
					id="system-prompt"
					bind:value={systemPrompt}
					rows="8"
					placeholder="Tell the agent who it is, what it should focus on, and how it should respond. For example:&#10;&#10;You are a reorder specialist. Analyze account ordering patterns and proactively identify accounts that should be placing reorders based on their historical buying frequency."
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
				></textarea>
				<p class="text-sm text-muted-foreground">
					This prompt is injected as additional context when the agent runs.
				</p>
			</div>

			<div class="space-y-3 border-t pt-4">
				<div class="flex items-center gap-2">
					<input
						id="restrict-tools"
						type="checkbox"
						bind:checked={restrictTools}
						class="h-4 w-4 rounded border-input"
					/>
					<Label for="restrict-tools" class="cursor-pointer">
						Restrict which tools this agent can use
					</Label>
				</div>
				<p class="text-sm text-muted-foreground">
					By default an agent has access to every AI tool. Restricting tools narrows its focus and
					limits blast radius — e.g. a reporting agent doesn't need create_brand or send_email.
				</p>
				{#if restrictTools}
					<div class="space-y-4 rounded-md border p-3">
						{#each TOOL_CATALOG as group (group.group)}
							<div class="space-y-2">
								<div class="text-sm font-semibold">{group.group}</div>
								<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
									{#each group.tools as tool (tool.name)}
										<label
											class="flex cursor-pointer items-center gap-2 text-sm"
											for="tool-{tool.name}"
										>
											<input
												id="tool-{tool.name}"
												type="checkbox"
												checked={allowedTools.includes(tool.name)}
												onchange={(e) => toggleTool(tool.name, e.currentTarget.checked)}
												class="h-4 w-4 rounded border-input"
											/>
											<span>{tool.label}</span>
										</label>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</CardContent>
		<CardFooter class="justify-between">
			<Button variant="outline" href="/organization/agents">Cancel</Button>
			<Button onclick={handleCreate} {loading}>Create Agent</Button>
		</CardFooter>
	</Card>
</div>
