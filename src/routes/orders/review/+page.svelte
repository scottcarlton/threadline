<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';

	let { data } = $props();
	const intakes = $derived(data.intakes);

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<PageHeader
	title="Review Email Orders"
	subtitle="Orders that need your attention before submission"
/>

{#if intakes.length === 0}
	<div class="flex flex-col items-center justify-center py-20 text-center">
		<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z"
				/>
			</svg>
		</div>
		<h3 class="mt-4 text-lg font-semibold">No orders to review</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			Email orders that need attention will appear here
		</p>
	</div>
{:else}
	<div class="mt-6 overflow-hidden rounded-lg border">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">From</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Subject</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Received</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Issues</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each intakes as intake (intake.id)}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3 font-medium">{intake.from_email}</td>
						<td class="px-4 py-3 text-muted-foreground">{intake.subject ?? '(no subject)'}</td>
						<td class="px-4 py-3 text-muted-foreground">{formatDate(intake.created_at)}</td>
						<td class="px-4 py-3">
							{#if intake.needs_review_reasons}
								<span
									class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
								>
									{intake.needs_review_reasons.length} issue{intake.needs_review_reasons.length !==
									1
										? 's'
										: ''}
								</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-right">
							<Button variant="outline" size="sm" href="/orders/review/{intake.id}">Review</Button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
