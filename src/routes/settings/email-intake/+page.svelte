<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import Switch from '$lib/components/ui/switch.svelte';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let enabled = $state(data.emailIntakeEnabled);
	let saving = $state(false);
	let saved = $state(false);
</script>

<div class="max-w-2xl space-y-8">
	<div>
		<h2 class="text-xl font-semibold">Email Ordering</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Send orders to Threadline by emailing <code
				class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">stitch@threadline.systems</code
			>
		</p>
	</div>

	{#if !data.canToggle}
		<div
			class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
		>
			Only reps, admins, and owners can enable email ordering. Contact your organization admin to
			get access.
		</div>
	{:else}
		<form
			method="POST"
			use:enhance={() => {
				saving = true;
				saved = false;
				return async ({ update }) => {
					saving = false;
					saved = true;
					setTimeout(() => (saved = false), 2000);
					await update({ reset: false });
				};
			}}
			class="space-y-6"
		>
			<div class="rounded-lg border p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium">Enable email ordering</p>
						<p class="text-sm text-muted-foreground">
							Allow orders to be created when you email stitch@threadline.systems
						</p>
					</div>
					<input type="hidden" name="email_intake_enabled" value="off" />
					<Switch
						bind:checked={enabled}
						name="email_intake_enabled"
						value="on"
						aria-label="Enable email ordering"
					/>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<Button type="submit" disabled={saving}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
				{#if saved}
					<span class="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>
				{/if}
			</div>
		</form>

		<!-- Template reference -->
		<div class="space-y-3 rounded-lg border p-6">
			<h3 class="text-sm font-semibold">Email format</h3>
			<p class="text-sm text-muted-foreground">
				Send an email to <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
					>stitch@threadline.systems</code
				> with the following format. The subject line can be anything.
			</p>
			<pre
				class="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed">{`Account: Bloom Boutique
Brand: Monarch Haze              (optional if inferrable)
Ship window: 5/20 - 6/20         (start / end)

Kailua Bubble Gauze Cotton Shirt: 2 XS, 3 S, 3 L, 1 XL
Catya Blouse - Monarch Haze: 2 S, 3 L, 1 XL, 1 XXL

Notes: (free-form, optional)`}</pre>
			<p class="text-sm text-muted-foreground">
				You can also use a more casual format — just include the account name and line items with
				sizes and quantities.
			</p>
		</div>
	{/if}
</div>
