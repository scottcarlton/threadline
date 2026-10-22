<script lang="ts">
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogTitle,
		DialogDescription
	} from '$lib/components/ui/dialog/index.js';
	import { outbox, type OutboxItem } from '$lib/offline';
	import { KIND_LABELS } from '$lib/offline/banner';
	import { dependencyState } from '$lib/offline/machine';
	import { syncPanelOpen } from '$lib/offline/sync-ui';

	const items = outbox.items;

	const byId = $derived(new Map($items.map((i) => [i.id, i])));
	const attention = $derived(
		$items.filter((i) => i.status === 'failed' || i.status === 'needs_review')
	);
	const waiting = $derived($items.filter((i) => i.status === 'pending' || i.status === 'syncing'));
	const synced = $derived($items.filter((i) => i.status === 'synced'));

	const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

	function depLabels(item: OutboxItem, statuses: OutboxItem['status'][]): string {
		return item.dependsOn
			.map((id) => byId.get(id))
			.filter((d): d is OutboxItem => !!d && statuses.includes(d.status))
			.map((d) => d.label)
			.join(', ');
	}

	function statusLine(item: OutboxItem): string {
		switch (item.status) {
			case 'syncing':
				return 'Syncing';
			case 'synced': {
				// Orders swap their local reference for the numbers the server assigned.
				const numbers = (
					item.result as { orders?: Array<{ order_number: string }> } | undefined
				)?.orders?.map((o) => o.order_number);
				return numbers?.length
					? `Synced as ${numbers.join(', ')}`
					: `Synced at ${timeFormat.format(item.updatedAt)}`;
			}
			case 'failed':
			case 'needs_review':
				return item.lastError ?? "Couldn't sync";
			case 'pending': {
				const deps = dependencyState(item, byId);
				if (deps === 'blocked') {
					return `Waiting on ${depLabels(item, ['failed', 'needs_review'])}, which couldn't sync`;
				}
				if (deps === 'waiting') return `Syncs after ${depLabels(item, ['pending', 'syncing'])}`;
				return item.lastError ? `Will retry. Last try: ${item.lastError}` : 'Waiting to sync';
			}
		}
	}

	// Discard confirms first and names everything that goes with the item.
	let discardTarget = $state<OutboxItem | null>(null);
	let discardAlso = $state<OutboxItem[]>([]);

	async function askDiscard(item: OutboxItem) {
		const ids = await outbox.dependentsOf(item.id);
		discardAlso = ids.map((id) => byId.get(id)).filter((d): d is OutboxItem => !!d);
		discardTarget = item;
	}

	async function confirmDiscard() {
		if (!discardTarget) return;
		await outbox.discard(discardTarget.id);
		discardTarget = null;
		discardAlso = [];
	}

	const sections = $derived(
		[
			{ title: 'Needs attention', rows: attention },
			{ title: 'Waiting to sync', rows: waiting },
			{ title: 'Synced', rows: synced }
		].filter((s) => s.rows.length > 0)
	);
</script>

<OverlayPanel
	open={$syncPanelOpen}
	side="right"
	width="420px"
	ariaLabel="Sync"
	onclose={() => syncPanelOpen.set(false)}
>
	<div class="flex h-full flex-col overflow-hidden">
		<div class="flex shrink-0 items-center justify-between px-5 py-4">
			<h2 class="text-lg font-semibold">Sync</h2>
			<button
				onclick={() => syncPanelOpen.set(false)}
				class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				aria-label="Close sync"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
			{#if sections.length === 0}
				<div class="mt-16 text-center">
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
							d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
						/>
					</svg>
					<p class="mt-4 text-lg font-semibold">Nothing waiting to sync</p>
					<p class="mt-2 text-sm text-muted-foreground">
						Accounts and orders saved offline appear here until they reach Threadline.
					</p>
				</div>
			{:else}
				{#each sections as section (section.title)}
					<section class="mt-4 first:mt-0">
						<h3 class="mb-2 text-sm font-medium text-muted-foreground">{section.title}</h3>
						<ul class="space-y-2">
							{#each section.rows as row (row.id)}
								<li class="rounded-lg bg-muted/50 px-3 py-3">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-medium">{row.label}</p>
											<p class="text-sm text-muted-foreground">{KIND_LABELS[row.kind]}</p>
										</div>
									</div>
									<p
										class="mt-1 text-sm {row.status === 'failed' || row.status === 'needs_review'
											? 'text-destructive'
											: 'text-muted-foreground'}"
									>
										{statusLine(row)}
									</p>
									{#if row.status === 'failed' || row.status === 'pending'}
										<div class="mt-2 flex gap-2">
											{#if row.status === 'failed' || row.lastError}
												<Button variant="outline" onclick={() => outbox.retry(row.id)}>
													Retry
												</Button>
											{/if}
											<Button variant="ghost" onclick={() => askDiscard(row)}>Discard</Button>
										</div>
									{:else if row.status === 'needs_review'}
										<div class="mt-2 flex gap-2">
											<Button variant="ghost" onclick={() => askDiscard(row)}>Dismiss</Button>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</div>
	</div>
</OverlayPanel>

<Dialog
	open={discardTarget !== null}
	onOpenChange={(open) => {
		if (!open) discardTarget = null;
	}}
>
	<DialogContent class="max-w-md p-6">
		<DialogTitle>
			{discardTarget?.status === 'needs_review' ? 'Dismiss' : 'Discard'}
			{discardTarget?.label}?
		</DialogTitle>
		<DialogDescription>
			{#if discardTarget?.status === 'needs_review'}
				It already reached Threadline. This only removes it from this list.
			{:else}
				It's deleted from this device and never reaches Threadline.
			{/if}
			{#if discardAlso.length > 0}
				{discardAlso.length === 1
					? 'This also goes, because it depends on it:'
					: 'These also go, because they depend on it:'}
				{discardAlso.map((d) => d.label).join(', ')}.
			{/if}
		</DialogDescription>
		<div class="flex justify-end gap-2 pt-5">
			<Button variant="outline" onclick={() => (discardTarget = null)}>Keep</Button>
			<Button variant="destructive" onclick={confirmDiscard}>
				{discardTarget?.status === 'needs_review' ? 'Dismiss' : 'Discard'}
			</Button>
		</div>
	</DialogContent>
</Dialog>
