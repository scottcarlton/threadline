<script lang="ts">
	import { Popover } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		defaultCommissionRate: number;
		onCopied?: (url: string, rate: number) => void;
	};
	let { defaultCommissionRate, onCopied }: Props = $props();

	const presets = [8, 10, 12, 14];

	let open = $state(false);
	let copying = $state(false);
	let customMode = $state(false);
	let customRate = $state(10);

	// The currently selected rate
	let selectedRate = $state(10);

	// When the popover opens, pre-select from the org's default rate
	$effect(() => {
		if (open) {
			const rate = defaultCommissionRate;
			if (presets.includes(rate)) {
				selectedRate = rate;
				customMode = false;
			} else {
				customMode = true;
				customRate = rate;
				selectedRate = rate;
			}
		}
	});

	function pickPreset(rate: number) {
		selectedRate = rate;
		customMode = false;
	}

	function pickCustom() {
		customMode = true;
		selectedRate = customRate;
	}

	function onCustomInput(e: Event) {
		const val = parseFloat((e.currentTarget as HTMLInputElement).value);
		if (!isNaN(val)) {
			customRate = Math.max(0, Math.min(100, val));
			selectedRate = customRate;
		}
	}

	async function copyLink() {
		copying = true;
		try {
			const res = await fetch('/api/connections/share', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commissionRate: selectedRate })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Failed to generate link');
				return;
			}
			const { url } = (await res.json()) as { url: string };
			await navigator.clipboard.writeText(url);
			toast.success('Link copied', {
				description: `One-time use at ${selectedRate}% commission`
			});
			open = false;
			onCopied?.(url, selectedRate);
		} catch {
			toast.error("Couldn't copy the link — try again.");
		} finally {
			copying = false;
		}
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
	>
		Copy connect link
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-3.5 w-3.5 text-muted-foreground"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
		</svg>
	</Popover.Trigger>
	<Popover.Content
		class="animate-in fade-in-0 zoom-in-95 z-50 w-80 rounded-md border bg-background p-4 shadow-lg"
		sideOffset={4}
		align="start"
	>
		<p class="text-sm font-medium">Commission for this share</p>

		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each presets as rate (rate)}
				<button
					type="button"
					class="rounded-md px-2.5 py-1.5 text-sm transition-colors {!customMode &&
					selectedRate === rate
						? 'bg-foreground text-background'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
					onclick={() => pickPreset(rate)}
				>
					{rate}%
				</button>
			{/each}
			<button
				type="button"
				class="rounded-md px-2.5 py-1.5 text-sm transition-colors {customMode
					? 'bg-foreground text-background'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
				onclick={pickCustom}
			>
				Custom
			</button>
		</div>

		{#if customMode}
			<div class="mt-3">
				<div class="flex items-center gap-2">
					<input
						type="number"
						min="0"
						max="100"
						step="0.25"
						value={customRate}
						oninput={onCustomInput}
						class="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					/>
					<span class="text-sm text-muted-foreground">%</span>
				</div>
			</div>
		{/if}

		<div class="mt-4 space-y-2">
			<Button size="sm" disabled={copying} onclick={copyLink} class="w-full">
				{copying ? 'Copying…' : 'Copy link'}
			</Button>
			<p class="text-sm text-muted-foreground">
				Each copy replaces the previous link. The link works once.
			</p>
		</div>
	</Popover.Content>
</Popover.Root>
