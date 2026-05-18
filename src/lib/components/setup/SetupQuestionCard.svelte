<script lang="ts">
	import { setupWizard } from '$lib/stores/setup-wizard.js';
	import { invalidateAll } from '$app/navigation';

	let wizard = $derived($setupWizard);
	let step = $derived(wizard.steps[wizard.currentIndex]);
	let isFirst = $derived(wizard.currentIndex === 0);
	let total = $derived(wizard.steps.length);
	let current = $derived(wizard.currentIndex + 1);

	let selectedMulti = $state<string[]>([]);
	let textValue = $state('');
	let saving = $state(false);

	$effect(() => {
		// Reset selection state when step changes
		wizard.currentIndex;
		selectedMulti = [];
		textValue = '';
		const saved = step ? wizard.answers[step.id] : undefined;
		if (saved && step) {
			if (step.type === 'multi') selectedMulti = [...(saved as string[])];
			else if (step.type === 'text') textValue = saved as string;
		}
	});

	function toggleMulti(value: string) {
		if (selectedMulti.includes(value)) {
			selectedMulti = selectedMulti.filter((v) => v !== value);
		} else {
			selectedMulti = [...selectedMulti, value];
		}
	}

	async function save(answer: string | string[]) {
		if (!step || saving) return;
		const currentStepId = step.id;
		const currentIdx = wizard.currentIndex;
		const totalSteps = wizard.steps.length;
		saving = true;

		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ step: currentStepId, value: answer })
			});
			if (!res.ok) {
				console.error('Save failed:', await res.text());
				saving = false;
				return;
			}
		} catch (err) {
			console.error('Save error:', err);
			saving = false;
			return;
		}

		setupWizard.saveAnswer(currentStepId, answer);

		if (currentIdx < totalSteps - 1) {
			setupWizard.goNext();
		} else {
			setupWizard.close();
			await invalidateAll();
		}
		saving = false;
	}
</script>

{#if step}
	<div>
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<p class="text-sm font-medium text-zinc-100">{step.question}</p>
			<div class="flex items-center gap-2 text-sm text-zinc-500">
				{#if !isFirst}
					<button onclick={() => setupWizard.goBack()} class="transition-colors hover:text-zinc-300"
						>&lt;</button
					>
				{/if}
				<span>{current} of {total}</span>
				<button
					onclick={() => setupWizard.close()}
					class="ml-1 transition-colors hover:text-zinc-300">&times;</button
				>
			</div>
		</div>

		<!-- Options -->
		<div class="space-y-1.5">
			{#if step.type === 'single'}
				{#each step.options ?? [] as option, i (i)}
					<button
						onclick={() => save(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border border-zinc-700 px-3 py-2.5 text-left transition-colors hover:bg-zinc-700"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-700 text-sm text-zinc-400"
							>{i + 1}</span
						>
						<span class="text-sm text-zinc-200">{option.label}</span>
					</button>
				{/each}
				<!-- Skip -->
				<div class="mt-2 flex justify-end">
					<button
						onclick={() => save('skip')}
						disabled={saving}
						class="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
						>Skip</button
					>
				</div>
			{:else if step.type === 'multi'}
				{#each step.options ?? [] as option, i (i)}
					<button
						onclick={() => toggleMulti(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-zinc-700 {selectedMulti.includes(
							option.value
						)
							? 'border-zinc-500 bg-zinc-700'
							: 'border-zinc-700'}"
					>
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded border text-sm {selectedMulti.includes(
								option.value
							)
								? 'border-zinc-400 bg-zinc-600 text-zinc-200'
								: 'border-zinc-600 text-transparent'}">✓</span
						>
						<span class="text-sm text-zinc-200">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex items-center justify-between">
					<span class="text-sm text-zinc-500">{selectedMulti.length} selected</span>
					<div class="flex gap-2">
						<button
							onclick={() => save('skip')}
							disabled={saving}
							class="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
							>Skip</button
						>
						<button
							onclick={() => save(selectedMulti)}
							disabled={selectedMulti.length === 0 || saving}
							class="rounded-lg bg-zinc-600 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-500 disabled:opacity-40"
							>→</button
						>
					</div>
				</div>
			{:else if step.type === 'yesno'}
				<button
					onclick={() => save('yes')}
					disabled={saving}
					class="flex w-full items-center gap-3 rounded-lg border border-zinc-700 px-3 py-2.5 text-left transition-colors hover:bg-zinc-700"
				>
					<span
						class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-700 text-sm text-zinc-400"
						>1</span
					>
					<span class="text-sm text-zinc-200">Yes</span>
				</button>
				<button
					onclick={() => save('skip')}
					disabled={saving}
					class="flex w-full items-center gap-3 rounded-lg border border-zinc-700 px-3 py-2.5 text-left transition-colors hover:bg-zinc-700"
				>
					<span
						class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-700 text-sm text-zinc-400"
						>2</span
					>
					<span class="text-sm text-zinc-200">{step.skipLabel ?? 'No, skip this'}</span>
				</button>
			{:else if step.type === 'text'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						if (textValue.trim()) save(textValue.trim());
					}}
				>
					<input
						bind:value={textValue}
						placeholder={step.placeholder ?? ''}
						class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
					/>
					<div class="mt-2 flex justify-between">
						<button
							type="button"
							onclick={() => save('skip')}
							disabled={saving}
							class="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
							>Skip</button
						>
						<button
							type="submit"
							disabled={!textValue.trim() || saving}
							class="rounded-lg bg-zinc-600 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-500 disabled:opacity-40"
							>{saving ? 'Saving...' : 'Continue'}</button
						>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}
