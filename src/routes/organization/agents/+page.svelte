<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { OrgAgent } from '$lib/types/database.js';

	let { data } = $props();
	const agents = $derived(data.agents as OrgAgent[]);
	const isAdmin = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Agents (AI)</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Custom AI agents to automate and enhance your workflows
			</p>
		</div>
		{#if isAdmin}
			<Button href="/organization/agents/new">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
				>
				New Agent
			</Button>
		{/if}
	</div>

	{#if agents.length === 0}
		<div class="rounded-none p-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="0.4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">Build your first agent</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Create custom AI agents with specialized prompts to automate tasks and enhance your sales
				workflows
			</p>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			{#each agents as agent (agent.id)}
				<a href="/organization/agents/{agent.id}" class="block">
					<Card class="transition-colors hover:bg-muted/30">
						<CardContent class="pt-5 pb-5">
							<div class="flex items-start justify-between">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5 text-muted-foreground"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="1.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
											/>
										</svg>
									</div>
									<div>
										<p class="text-sm font-medium">{agent.name}</p>
										<p class="font-mono text-sm text-muted-foreground">@{agent.slug}</p>
									</div>
								</div>
								<Badge variant={agent.is_active ? 'success' : 'secondary'}>
									{agent.is_active ? 'Active' : 'Inactive'}
								</Badge>
							</div>
							{#if agent.description}
								<p class="mt-3 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
							{/if}
							<p class="mt-3 text-sm text-muted-foreground">
								Created by {agent.profiles?.display_name ?? 'Unknown'} · {new Date(
									agent.created_at
								).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</p>
						</CardContent>
					</Card>
				</a>
			{/each}
		</div>
	{/if}
</div>
