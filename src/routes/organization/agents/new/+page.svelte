<script lang="ts">
	import { goto } from '$app/navigation';
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

	let { data } = $props();

	let name = $state('');
	let slug = $state('');
	let description = $state('');
	let systemPrompt = $state('');
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
			goto(`/organization/agents/${agent.id}`);
		}
	}
</script>

<div class="max-w-2xl space-y-6">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" href="/organization/agents"><LongArrow direction="left" /> Back</Button>
		<h2 class="text-lg font-semibold">New Agent</h2>
	</div>

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
					This prompt is injected as additional context when the agent runs. It has access to all
					standard AI tools.
				</p>
			</div>
		</CardContent>
		<CardFooter class="justify-between">
			<Button variant="outline" href="/organization/agents">Cancel</Button>
			<Button onclick={handleCreate} disabled={loading}>
				{loading ? 'Creating...' : 'Create Agent'}
			</Button>
		</CardFooter>
	</Card>
</div>
