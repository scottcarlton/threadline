<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { OrgAgent, OrgAgentTrigger, OrgAgentRun } from '$lib/types/database.js';

	let { data } = $props();
	const agent = $derived(data.agent as OrgAgent);
	const triggers = $derived(data.triggers as OrgAgentTrigger[]);
	const runs = $derived(data.runs as OrgAgentRun[]);
	const isAdmin = $derived(
		data.membership?.role === 'admin' || data.membership?.role === 'owner'
	);

	// Edit state
	let editing = $state(false);
	let editName = $state('');
	let editDescription = $state('');
	let editPrompt = $state('');
	let error = $state('');
	let loading = $state(false);

	// Trigger form state
	let showTriggerForm = $state(false);
	let triggerType = $state<'event' | 'schedule'>('event');
	let triggerEvent = $state('order_submitted');
	let triggerCron = $state('0 9 * * 1');
	let triggerPrompt = $state('');
	let triggerNotify = $state('none');
	let triggerError = $state('');

	// Expanded run
	let expandedRun = $state<string | null>(null);

	const eventOptions = [
		{ value: 'order_submitted', label: 'Order Submitted' },
		{ value: 'order_confirmed', label: 'Order Confirmed' },
		{ value: 'order_shipped', label: 'Order Shipped' },
		{ value: 'order_cancelled', label: 'Order Cancelled' },
		{ value: 'new_account', label: 'New Account Created' }
	];

	const cronPresets = [
		{ value: '0 9 * * 1-5', label: 'Weekdays at 9am' },
		{ value: '0 9 * * 1', label: 'Monday at 9am' },
		{ value: '0 9 1 * *', label: '1st of month at 9am' },
		{ value: 'custom', label: 'Custom' }
	];

	function startEdit() {
		editName = agent.name;
		editDescription = agent.description ?? '';
		editPrompt = agent.system_prompt;
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('org_agents')
			.update({
				name: editName,
				description: editDescription || null,
				system_prompt: editPrompt,
				updated_at: new Date().toISOString()
			})
			.eq('id', agent.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	async function toggleActive() {
		await supabase
			.from('org_agents')
			.update({ is_active: !agent.is_active, updated_at: new Date().toISOString() })
			.eq('id', agent.id);
		invalidateAll();
	}

	async function handleDelete() {
		await supabase.from('org_agents').delete().eq('id', agent.id);
		goto('/organization/agents');
	}

	async function handleAddTrigger() {
		if (!triggerPrompt) {
			triggerError = 'Trigger prompt is required.';
			return;
		}

		triggerError = '';

		const insertData: Record<string, unknown> = {
			agent_id: agent.id,
			organization_id: agent.organization_id,
			trigger_type: triggerType,
			trigger_prompt: triggerPrompt,
			notify_channel: triggerNotify
		};

		if (triggerType === 'event') {
			insertData.event_name = triggerEvent;
		} else {
			insertData.cron_expression = triggerCron;
		}

		const { error: err } = await supabase
			.from('org_agent_triggers')
			.insert(insertData);

		if (err) {
			triggerError = err.message;
		} else {
			showTriggerForm = false;
			triggerPrompt = '';
			invalidateAll();
		}
	}

	async function toggleTrigger(trigger: OrgAgentTrigger) {
		await supabase
			.from('org_agent_triggers')
			.update({ is_active: !trigger.is_active })
			.eq('id', trigger.id);
		invalidateAll();
	}

	async function deleteTrigger(triggerId: string) {
		await supabase.from('org_agent_triggers').delete().eq('id', triggerId);
		invalidateAll();
	}

	function formatDuration(ms: number | null): string {
		if (!ms) return '—';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/organization/agents">← Back</Button>
			<h2 class="text-lg font-semibold">{agent.name}</h2>
			<Badge variant={agent.is_active ? 'success' : 'secondary'}>
				{agent.is_active ? 'Active' : 'Inactive'}
			</Badge>
		</div>
		{#if isAdmin && !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={toggleActive}>
					{agent.is_active ? 'Deactivate' : 'Activate'}
				</Button>
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<!-- Agent Details -->
	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form id="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" bind:value={editName} />
					</div>
					<div class="space-y-2">
						<Label for="description">Description</Label>
						<Input id="description" bind:value={editDescription} />
					</div>
					<div class="space-y-2">
						<Label for="prompt">System Prompt</Label>
						<textarea
							id="prompt"
							bind:value={editPrompt}
							rows="8"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-4">
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Slug</dt>
						<dd class="mt-1 font-mono text-sm">@{agent.slug}</dd>
					</div>
					{#if agent.description}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Description</dt>
							<dd class="mt-1">{agent.description}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-sm font-medium text-muted-foreground">System Prompt</dt>
						<dd class="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{agent.system_prompt}</dd>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Created By</dt>
							<dd class="mt-1">{agent.profiles?.display_name ?? 'Unknown'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Created</dt>
							<dd class="mt-1">{new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
						</div>
					</div>
				</dl>
			{/if}
		</CardContent>
		{#if editing}
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
				<Button type="submit" form="edit-form" disabled={loading}>
					{loading ? 'Saving...' : 'Save Changes'}
				</Button>
			</CardFooter>
		{/if}
	</Card>

	<!-- Triggers -->
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle class="text-base">Triggers</CardTitle>
				{#if isAdmin}
					<Button size="sm" variant="outline" onclick={() => (showTriggerForm = !showTriggerForm)}>
						{showTriggerForm ? 'Cancel' : 'Add Trigger'}
					</Button>
				{/if}
			</div>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if showTriggerForm}
				<div class="space-y-4 border-b pb-4">
					{#if triggerError}
						<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{triggerError}</div>
					{/if}

					<div class="space-y-2">
						<Label>Trigger Type</Label>
						<div class="flex gap-2">
							<button
								class="rounded-md border px-3 py-1.5 text-sm {triggerType === 'event' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (triggerType = 'event')}
							>Event</button>
							<button
								class="rounded-md border px-3 py-1.5 text-sm {triggerType === 'schedule' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (triggerType = 'schedule')}
							>Schedule</button>
						</div>
					</div>

					{#if triggerType === 'event'}
						<div class="space-y-2">
							<Label for="trigger-event">When this happens</Label>
							<select
								id="trigger-event"
								bind:value={triggerEvent}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								{#each eventOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
					{:else}
						<div class="space-y-2">
							<Label for="trigger-schedule">Schedule</Label>
							<select
								id="trigger-schedule"
								bind:value={triggerCron}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								{#each cronPresets as preset}
									<option value={preset.value}>{preset.label}</option>
								{/each}
							</select>
							<p class="text-sm text-muted-foreground">Scheduled triggers coming soon</p>
						</div>
					{/if}

					<div class="space-y-2">
						<Label for="trigger-prompt">What should the agent do?</Label>
						<textarea
							id="trigger-prompt"
							bind:value={triggerPrompt}
							rows="3"
							placeholder="e.g. Check which accounts placed this order's brand last season but haven't ordered yet this season. Summarize findings."
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						></textarea>
					</div>

					<div class="space-y-2">
						<Label for="trigger-notify">Notify via</Label>
						<select
							id="trigger-notify"
							bind:value={triggerNotify}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value="none">No notification</option>
							<option value="slack">Slack</option>
							<option value="discord">Discord</option>
						</select>
					</div>

					<div class="flex justify-end">
						<Button onclick={handleAddTrigger}>Add Trigger</Button>
					</div>
				</div>
			{/if}

			{#if triggers.length === 0 && !showTriggerForm}
				<p class="text-sm text-muted-foreground">No triggers configured. Add a trigger to automate this agent.</p>
			{:else}
				<div class="divide-y">
					{#each triggers as trigger}
						<div class="flex items-center justify-between py-3">
							<div>
								<div class="flex items-center gap-2">
									<Badge variant="secondary">
										{trigger.trigger_type === 'event' ? trigger.event_name?.replace('_', ' ') : 'Scheduled'}
									</Badge>
									{#if !trigger.is_active}
										<Badge variant="secondary">Disabled</Badge>
									{/if}
								</div>
								<p class="mt-1 text-sm text-muted-foreground line-clamp-1">{trigger.trigger_prompt}</p>
								{#if trigger.notify_channel !== 'none'}
									<p class="mt-0.5 text-sm text-muted-foreground">Notifies via {trigger.notify_channel}</p>
								{/if}
							</div>
							{#if isAdmin}
								<div class="flex gap-1">
									<button
										class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
										onclick={() => toggleTrigger(trigger)}
										aria-label={trigger.is_active ? 'Disable' : 'Enable'}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											{#if trigger.is_active}
												<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
											{:else}
												<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
											{/if}
										</svg>
									</button>
									<button
										class="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										onclick={() => deleteTrigger(trigger.id)}
										aria-label="Delete trigger"
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Recent Runs -->
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Recent Runs</CardTitle>
		</CardHeader>
		<CardContent>
			{#if runs.length === 0}
				<p class="text-sm text-muted-foreground">No runs yet. Invoke this agent from the AI chat or trigger it with an event.</p>
			{:else}
				<div class="divide-y">
					{#each runs as run}
						<button
							class="flex w-full items-center justify-between py-3 text-left transition-colors hover:bg-muted/30"
							onclick={() => (expandedRun = expandedRun === run.id ? null : run.id)}
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="inline-flex h-2 w-2 rounded-full {run.status === 'completed' ? 'bg-emerald-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}"></span>
									<span class="text-sm font-medium">{run.triggered_by}</span>
									<span class="text-sm text-muted-foreground">{formatDuration(run.duration_ms)}</span>
								</div>
								<p class="mt-0.5 text-sm text-muted-foreground line-clamp-1">{run.input_prompt}</p>
							</div>
							<span class="ml-2 shrink-0 text-sm text-muted-foreground">
								{new Date(run.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
							</span>
						</button>
						{#if expandedRun === run.id}
							<div class="border-l-2 border-muted pl-4 py-3">
								{#if run.output_text}
									<p class="whitespace-pre-wrap text-sm">{run.output_text}</p>
								{/if}
								{#if run.tools_used?.length}
									<div class="mt-2 flex flex-wrap gap-1">
										{#each run.tools_used as tool}
											<span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">{tool}</span>
										{/each}
									</div>
								{/if}
								{#if run.error_message}
									<p class="mt-2 text-sm text-destructive">{run.error_message}</p>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Danger Zone -->
	{#if isAdmin}
		<Card>
			<CardContent class="pt-5 pb-5">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-destructive">Delete Agent</p>
						<p class="text-sm text-muted-foreground">This will permanently delete the agent and all its triggers and run history.</p>
					</div>
					<Button variant="destructive" size="sm" onclick={handleDelete}>Delete</Button>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
