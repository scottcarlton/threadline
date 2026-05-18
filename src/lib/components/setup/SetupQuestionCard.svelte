<script lang="ts">
	import { setupWizard } from '$lib/stores/setup-wizard.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let wizard = $derived($setupWizard);
	let step = $derived(wizard.steps[wizard.currentIndex]);
	let isFirst = $derived(wizard.currentIndex === 0);
	let isLast = $derived(wizard.currentIndex === wizard.steps.length - 1);
	let total = $derived(wizard.steps.length);
	let current = $derived(wizard.currentIndex + 1);

	// Input state
	let selectedMulti = $state<string[]>([]);
	let saving = $state(false);

	// Address fields
	let addrLine1 = $state('');
	let addrLine2 = $state('');
	let addrCity = $state('');
	let addrState = $state('');
	let addrZip = $state('');

	$effect(() => {
		wizard.currentIndex;
		resetInputs();
	});

	function resetInputs() {
		selectedMulti = [];
		addrLine1 = '';
		addrLine2 = '';
		addrCity = '';
		addrState = '';
		addrZip = '';

		const saved = step ? wizard.answers[step.id] : undefined;
		if (saved && step) {
			if (step.type === 'multi') selectedMulti = [...(saved as string[])];
			if (step.type === 'address' && typeof saved === 'object' && saved !== null) {
				const a = saved as Record<string, string>;
				addrLine1 = a.line1 ?? '';
				addrLine2 = a.line2 ?? '';
				addrCity = a.city ?? '';
				addrState = a.state ?? '';
				addrZip = a.zip ?? '';
			}
		}
	}

	function toggleMulti(value: string) {
		if (selectedMulti.includes(value)) {
			selectedMulti = selectedMulti.filter((v) => v !== value);
		} else {
			selectedMulti = [...selectedMulti, value];
		}
	}

	async function save(answer: unknown) {
		if (!step || saving) return;
		const currentStepId = step.id;
		saving = true;

		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ step: currentStepId, value: answer })
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Save failed' }));
				toast.error(body.error ?? 'Something went wrong');
				saving = false;
				return;
			}
		} catch {
			toast.error('Network error — please try again');
			saving = false;
			return;
		}

		setupWizard.saveAnswer(currentStepId, answer);

		if (isLast) {
			setupWizard.close();
			await invalidateAll();
		} else {
			setupWizard.goNext();
		}
		saving = false;
	}

	function handleAddressSubmit() {
		if (!addrLine1.trim() || !addrCity.trim() || !addrState.trim() || !addrZip.trim()) return;
		save({
			line1: addrLine1.trim(),
			line2: addrLine2.trim(),
			city: addrCity.trim(),
			state: addrState.trim(),
			zip: addrZip.trim()
		});
	}
</script>

{#if step}
	<div>
		<!-- Header with nav -->
		<div class="mb-4 flex items-center justify-between">
			<p class="text-sm font-medium">{step.question}</p>
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				{#if !isFirst}
					<button
						onclick={() => setupWizard.goBack()}
						class="transition-colors hover:text-foreground"
						aria-label="Previous question">&lt;</button
					>
				{/if}
				<span>{current} of {total}</span>
				{#if !isLast}
					<button
						onclick={() => setupWizard.goNext()}
						class="transition-colors hover:text-foreground"
						aria-label="Next question">&gt;</button
					>
				{/if}
				<button
					onclick={() => setupWizard.close()}
					class="ml-1 transition-colors hover:text-foreground"
					aria-label="Close setup">&times;</button
				>
			</div>
		</div>

		<!-- Step content -->
		<div class="space-y-1.5">
			{#if step.type === 'address'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleAddressSubmit();
					}}
				>
					<div class="space-y-2">
						<Input bind:value={addrLine1} placeholder="Street address" />
						<Input bind:value={addrLine2} placeholder="Apt, suite, etc. (optional)" />
						<div class="grid grid-cols-[1fr_80px_100px] gap-2">
							<Input bind:value={addrCity} placeholder="City" />
							<Input bind:value={addrState} placeholder="State" />
							<Input bind:value={addrZip} placeholder="ZIP" />
						</div>
					</div>
					<div class="mt-3 flex justify-between">
						<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}
							>Skip</Button
						>
						<Button
							type="submit"
							size="sm"
							disabled={!addrLine1.trim() ||
								!addrCity.trim() ||
								!addrState.trim() ||
								!addrZip.trim() ||
								saving}
						>
							{saving ? 'Saving...' : 'Continue'}
						</Button>
					</div>
				</form>
			{:else if step.type === 'single'}
				{#each step.options ?? [] as option, i (option.value)}
					<button
						onclick={() => save(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-sm font-medium text-muted-foreground"
						>
							{i + 1}
						</span>
						<span class="text-sm">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex justify-end">
					<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}
						>Skip</Button
					>
				</div>
			{:else if step.type === 'multi'}
				{#each step.options ?? [] as option (option.value)}
					<button
						onclick={() => toggleMulti(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent {selectedMulti.includes(
							option.value
						)
							? 'border-primary bg-accent'
							: 'border-border'}"
					>
						<Checkbox checked={selectedMulti.includes(option.value)} />
						<span class="text-sm">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex items-center justify-between">
					<span class="text-sm text-muted-foreground">{selectedMulti.length} selected</span>
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}
							>Skip</Button
						>
						<Button
							size="sm"
							onclick={() => save(selectedMulti)}
							disabled={selectedMulti.length === 0 || saving}
						>
							{saving ? 'Saving...' : 'Continue'}
						</Button>
					</div>
				</div>
			{:else if step.type === 'yesno'}
				{#each [{ label: 'Yes', value: 'yes', idx: 1 }, { label: step.skipLabel ?? 'No, skip this', value: 'skip', idx: 2 }] as opt (opt.value)}
					<button
						onclick={() => save(opt.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-sm font-medium text-muted-foreground"
						>
							{opt.idx}
						</span>
						<span class="text-sm">{opt.label}</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}
