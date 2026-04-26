<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { organizationReturnsSchema } from '$lib/schemas/organization-returns.js';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(organizationReturnsSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		onUpdated: ({ form }) => {
			if (form.valid && form.message?.success) {
				toast.success('Return policy updated.');
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Failed to save changes.');
		}
	});

	const returnsEnabled = $derived($form.windowDays > 0);

	let policyPreviewMode = $state(false);
	const policyHtml = $derived.by(() => {
		const md = $form.policyText ?? '';
		if (!md) return '';
		const raw = marked.parse(md, { async: false }) as string;
		return DOMPurify.sanitize(raw);
	});
</script>

<div class="max-w-2xl space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Returns</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">Return windows, fees, and policy.</p>
	</div>

	<form method="POST" use:enhance class="space-y-8">
		<!-- Window -->
		<section class="space-y-3">
			<h3 class="text-sm font-semibold">Return window</h3>
			<p class="text-sm text-muted-foreground">
				Number of days after delivery a buyer can request a return. Set to 0 to disable returns.
			</p>
			<div class="flex items-center gap-2">
				<Input
					id="window-days"
					type="number"
					min={0}
					step={1}
					bind:value={$form.windowDays}
					class="w-28"
					aria-invalid={$errors.windowDays ? 'true' : undefined}
				/>
				<span class="text-sm text-muted-foreground">days</span>
			</div>
			{#if $errors.windowDays}
				<p class="text-sm text-destructive">{$errors.windowDays[0]}</p>
			{/if}
			{#if !returnsEnabled}
				<p class="text-sm text-muted-foreground">Returns are currently disabled.</p>
			{/if}
		</section>

		<!-- Policy -->
		{#if returnsEnabled}
			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold">Policy</h3>
					<div class="flex items-center gap-2 text-sm">
						<button
							type="button"
							class={policyPreviewMode
								? 'text-muted-foreground hover:text-foreground'
								: 'font-medium text-foreground'}
							onclick={() => (policyPreviewMode = false)}
						>
							Write
						</button>
						<span class="text-muted-foreground">·</span>
						<button
							type="button"
							class={policyPreviewMode
								? 'font-medium text-foreground'
								: 'text-muted-foreground hover:text-foreground'}
							onclick={() => (policyPreviewMode = true)}
						>
							Preview
						</button>
					</div>
				</div>
				<p class="text-sm text-muted-foreground">
					Markdown supported. Buyers see this on their return request.
				</p>
				{#if !policyPreviewMode}
					<textarea
						id="policy-text"
						bind:value={$form.policyText}
						rows={10}
						maxlength={20000}
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						placeholder="What's eligible, how long buyers have, who pays return shipping…"
					></textarea>
				{:else if policyHtml}
					<div class="prose prose-sm max-w-none rounded-md border bg-background p-4">
						<!-- HTML is sanitized via isomorphic-dompurify above. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html policyHtml}
					</div>
				{:else}
					<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
						Nothing to preview yet.
					</p>
				{/if}
			</section>

			<!-- Return address -->
			<section class="space-y-4 rounded-md border p-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h3 class="text-sm font-semibold">Return address</h3>
						<p class="mt-0.5 text-sm text-muted-foreground">
							Where buyers ship returns. Defaults to your shipping ship-from.
						</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-sm text-muted-foreground">Use ship-from address</span>
						<Switch
							checked={$form.useShipFromAddress}
							onCheckedChange={(v) => ($form.useShipFromAddress = v)}
						/>
					</div>
				</div>

				{#if !$form.useShipFromAddress}
					<div class="space-y-4 border-t pt-4">
						<div class="space-y-2">
							<Label for="returns-line1">Address line 1</Label>
							<Input
								id="returns-line1"
								bind:value={$form.returnsAddressLine1}
								placeholder="123 Returns Center"
							/>
						</div>
						<div class="space-y-2">
							<Label for="returns-line2">Address line 2</Label>
							<Input
								id="returns-line2"
								bind:value={$form.returnsAddressLine2}
								placeholder="Bay 12"
							/>
						</div>
						<div class="grid grid-cols-[1fr_80px_100px] gap-3">
							<div class="space-y-2">
								<Label for="returns-city">City</Label>
								<Input
									id="returns-city"
									bind:value={$form.returnsAddressCity}
									placeholder="Newark"
								/>
							</div>
							<div class="space-y-2">
								<Label for="returns-state">State</Label>
								<Input id="returns-state" bind:value={$form.returnsAddressState} placeholder="NJ" />
							</div>
							<div class="space-y-2">
								<Label for="returns-zip">ZIP</Label>
								<Input id="returns-zip" bind:value={$form.returnsAddressZip} placeholder="07102" />
							</div>
						</div>
						<div class="space-y-2">
							<Label for="returns-country">Country</Label>
							<Input
								id="returns-country"
								bind:value={$form.returnsAddressCountry}
								maxlength={2}
								placeholder="US"
								class="w-24"
							/>
						</div>
					</div>
				{/if}
			</section>

			<!-- Restocking fee -->
			<section class="space-y-3">
				<h3 class="text-sm font-semibold">Restocking fee</h3>
				<p class="text-sm text-muted-foreground">Charged on every return. Set to 0 to skip.</p>
				<div class="flex items-stretch gap-2">
					<Input
						id="restocking-value"
						type="number"
						min={0}
						step={0.01}
						bind:value={$form.restockingFeeValue}
						class="w-40"
						aria-invalid={$errors.restockingFeeValue ? 'true' : undefined}
					/>
					<div class="flex overflow-hidden rounded-md border">
						{#each ['percent', 'flat'] as opt (opt)}
							<button
								type="button"
								class="px-3 py-2 text-sm transition-colors {$form.restockingFeeType === opt
									? 'bg-foreground text-background'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => ($form.restockingFeeType = opt as 'percent' | 'flat')}
							>
								{opt === 'percent' ? '%' : '$'}
							</button>
						{/each}
					</div>
				</div>
				{#if $errors.restockingFeeValue}
					<p class="text-sm text-destructive">{$errors.restockingFeeValue[0]}</p>
				{/if}
			</section>

			<!-- Buyer pays shipping -->
			<section>
				<label class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Buyer pays return shipping</p>
						<p class="mt-0.5 text-sm text-muted-foreground">Off means you cover the cost.</p>
					</div>
					<Switch
						checked={$form.buyerPaysShipping}
						onCheckedChange={(v) => ($form.buyerPaysShipping = v)}
					/>
				</label>
			</section>
		{/if}

		<div>
			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</form>
</div>
