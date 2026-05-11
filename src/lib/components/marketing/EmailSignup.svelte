<script lang="ts">
	type Props = {
		onsubmit: (email: string) => Promise<{ ok: boolean; error?: string }>;
		placeholder?: string;
		buttonText?: string;
		successMessage?: string;
	};

	let {
		onsubmit,
		placeholder = 'Enter your email',
		buttonText = 'Request access',
		successMessage = "You're on the list. Spots are limited. We'll be in touch once we've reviewed."
	}: Props = $props();

	let email = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let error = $state('');

	async function handleSubmit() {
		if (!email || submitting) return;
		submitting = true;
		error = '';
		try {
			const result = await onsubmit(email);
			if (result.ok) {
				submitted = true;
				email = '';
			} else {
				error = result.error ?? 'Something went wrong';
			}
		} catch {
			error = 'Something went wrong. Try again.';
		} finally {
			submitting = false;
		}
	}
</script>

{#if submitted}
	<p class="text-sm text-muted-foreground">{successMessage}</p>
{:else}
	<form
		class="grid w-full max-w-lg grid-cols-[1fr_auto] rounded-lg border border-neutral-300 p-1.5 focus-within:border-foreground"
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<input
			class="border-0 px-4 py-2 text-base outline-none"
			type="email"
			{placeholder}
			bind:value={email}
			required
		/>
		<button class="ml-2 rounded-md bg-accent px-5 py-3" disabled={submitting}>
			{submitting ? 'Submitting...' : buttonText}
		</button>
	</form>
	{#if error}
		<p class="mt-2 text-sm text-destructive">{error}</p>
	{/if}
{/if}
