<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { organizationOrdersSchema } from '$lib/schemas/organization-orders.js';
	import { brandTermsSchema } from '$lib/schemas/brand-terms.js';

	let { data } = $props();

	const canEditTerms = $derived(data.canEditTerms);
	const currentTerms = $derived(data.currentTerms);
	const termsHistory = $derived(data.termsHistory);

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(organizationOrdersSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Order defaults updated.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save changes.');
			}
		}
	});

	// Local toggle for handling fee — purely UI sugar so the input collapses
	// when the fee is "off". Persisted server-side as `handling_fee_amount = 0`.
	let handlingFeeEnabled = $state(($form.handlingFeeAmount ?? 0) > 0);
	function toggleHandlingFee(v: boolean) {
		handlingFeeEnabled = v;
		if (!v) $form.handlingFeeAmount = 0;
	}

	const sampleOrderNumber = $derived.by(() => {
		const padded =
			$form.orderNumberPadWidth > 0
				? String($form.nextOrderNumber).padStart($form.orderNumberPadWidth, '0')
				: String($form.nextOrderNumber);
		return `${$form.orderNumberPrefix}${padded}`;
	});

	// svelte-ignore state_referenced_locally
	// Stale client bundles (post-deploy, pre-reload) occasionally arrive before
	// load returns the new `termsForm` shape — fall back to schema defaults so
	// superForm doesn't throw and kill the rest of the page.
	const termsFormInitial = data.termsForm ?? {
		id: '',
		valid: false,
		posted: false,
		errors: {},
		data: { brand_id: '', title: 'Terms & Conditions', body: '' },
		constraints: {}
	};

	const {
		form: termsForm,
		errors: termsErrors,
		enhance: termsEnhance,
		submitting: termsSubmitting
	} = superForm(termsFormInitial, {
		validators: zod4Client(brandTermsSchema),
		validationMethod: 'onblur',
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Terms saved. The new version is now current.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save terms');
			}
		}
	});
</script>

<div class="max-w-lg space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Orders</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Defaults applied to new orders. Override per account.
		</p>
	</div>

	<form method="POST" action="?/saveSettings" use:enhance class="space-y-8">
		<!-- Order number format -->
		<section class="space-y-4">
			<h3 class="text-sm font-semibold">Order number format</h3>
			<div class="grid grid-cols-[120px_1fr_120px] gap-3">
				<div class="space-y-2">
					<Label for="prefix">Prefix</Label>
					<Input
						id="prefix"
						bind:value={$form.orderNumberPrefix}
						maxlength={10}
						placeholder="PO-"
						aria-invalid={$errors.orderNumberPrefix ? 'true' : undefined}
					/>
					{#if $errors.orderNumberPrefix}
						<p class="text-sm text-destructive">{$errors.orderNumberPrefix[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="next-number">Next number</Label>
					<Input
						id="next-number"
						type="number"
						min={1}
						step={1}
						bind:value={$form.nextOrderNumber}
						aria-invalid={$errors.nextOrderNumber ? 'true' : undefined}
					/>
					{#if $errors.nextOrderNumber}
						<p class="text-sm text-destructive">{$errors.nextOrderNumber[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="pad-width">Pad to digits</Label>
					<Input
						id="pad-width"
						type="number"
						min={0}
						max={12}
						step={1}
						bind:value={$form.orderNumberPadWidth}
						aria-invalid={$errors.orderNumberPadWidth ? 'true' : undefined}
					/>
					{#if $errors.orderNumberPadWidth}
						<p class="text-sm text-destructive">{$errors.orderNumberPadWidth[0]}</p>
					{/if}
				</div>
			</div>
			<p class="text-sm text-muted-foreground">
				Sample: <span class="font-mono">{sampleOrderNumber}</span>
				<span class="ml-2 text-muted-foreground">
					(0 in "Pad to digits" disables zero-padding)
				</span>
			</p>
		</section>

		<!-- Order minimum -->
		<section class="space-y-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">Order minimum</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Block orders under this amount unless an account override applies.
					</p>
				</div>
				<Switch
					checked={$form.orderMinimumEnabled}
					onCheckedChange={(v) => ($form.orderMinimumEnabled = v)}
				/>
			</div>

			{#if $form.orderMinimumEnabled}
				<div class="space-y-2">
					<Label for="min-amount">Minimum amount</Label>
					<div class="flex items-center gap-2">
						<span class="text-sm text-muted-foreground">$</span>
						<Input
							id="min-amount"
							type="number"
							min={0}
							step={0.01}
							bind:value={$form.orderMinimumAmount}
							class="w-40"
							aria-invalid={$errors.orderMinimumAmount ? 'true' : undefined}
						/>
					</div>
					{#if $errors.orderMinimumAmount}
						<p class="text-sm text-destructive">{$errors.orderMinimumAmount[0]}</p>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Default commission rate -->
		<section class="space-y-4">
			<h3 class="text-sm font-semibold">Default commission rate</h3>
			<p class="text-sm text-muted-foreground">
				Pre-selected when sharing your connect link with reps. Override per account.
			</p>
			<div class="space-y-2">
				<Label for="commission">Rate</Label>
				<div class="flex items-center gap-2">
					<Input
						id="commission"
						type="number"
						min={0}
						max={100}
						step={0.25}
						bind:value={$form.defaultCommissionRate}
						class="w-28"
						aria-invalid={$errors.defaultCommissionRate ? 'true' : undefined}
					/>
					<span class="text-sm text-muted-foreground">%</span>
				</div>
				{#if $errors.defaultCommissionRate}
					<p class="text-sm text-destructive">{$errors.defaultCommissionRate[0]}</p>
				{/if}
			</div>
		</section>

		<!-- Handling fee -->
		<section class="space-y-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">Handling fee</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">Flat fee added to every new order.</p>
				</div>
				<Switch checked={handlingFeeEnabled} onCheckedChange={toggleHandlingFee} />
			</div>

			{#if handlingFeeEnabled}
				<div class="space-y-2">
					<Label for="handling-fee">Amount</Label>
					<div class="flex items-center gap-2">
						<span class="text-sm text-muted-foreground">$</span>
						<Input
							id="handling-fee"
							type="number"
							min={0}
							step={0.01}
							bind:value={$form.handlingFeeAmount}
							class="w-40"
							aria-invalid={$errors.handlingFeeAmount ? 'true' : undefined}
						/>
					</div>
					{#if $errors.handlingFeeAmount}
						<p class="text-sm text-destructive">{$errors.handlingFeeAmount[0]}</p>
					{/if}
				</div>
			{/if}
		</section>

		<div>
			<Button type="submit" loading={$submitting} class="w-full sm:w-auto">Save changes</Button>
		</div>
	</form>

	{#if canEditTerms}
		<div class="border-t pt-8">
			<div>
				<h2 class="text-lg font-semibold">Buyer terms</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Terms reps present to buyers at order submit. Saving creates a new version and records it
					on every order that agrees.
				</p>
			</div>

			<form method="POST" action="?/saveTerms" use:termsEnhance class="mt-6 space-y-5">
				<input type="hidden" name="brand_id" bind:value={$termsForm.brand_id} />

				<div class="space-y-2">
					<Label for="terms-title">Title</Label>
					<Input
						id="terms-title"
						name="title"
						bind:value={$termsForm.title}
						maxlength={120}
						aria-invalid={$termsErrors.title ? 'true' : undefined}
					/>
					{#if $termsErrors.title}
						<p class="text-sm text-destructive">{$termsErrors.title[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="terms-body">Body</Label>
					<textarea
						id="terms-body"
						name="body"
						rows={14}
						maxlength={20000}
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						bind:value={$termsForm.body}
						placeholder="Cancellations, returns, shipping, payment terms…"
						aria-invalid={$termsErrors.body ? 'true' : undefined}
					></textarea>
					{#if $termsErrors.body}
						<p class="text-sm text-destructive">{$termsErrors.body[0]}</p>
					{/if}
				</div>

				<div
					class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<p class="text-sm text-muted-foreground">
						{#if currentTerms}
							Current version: v{currentTerms.version}. Saving creates v{currentTerms.version + 1}
							and marks prior versions as superseded.
						{:else}
							No terms on file. Saving creates v1.
						{/if}
					</p>
					<Button type="submit" loading={$termsSubmitting} class="w-full sm:w-auto">
						Save new version
					</Button>
				</div>
			</form>

			{#if termsHistory.length > 0}
				<div class="mt-6 rounded-lg border">
					<div class="border-b px-5 py-3 text-sm font-medium">Previous versions</div>
					<ul class="divide-y">
						{#each termsHistory as h (h.id)}
							<li class="flex items-center justify-between px-5 py-3 text-sm">
								<span>v{h.version} · {h.title}</span>
								<span class="text-muted-foreground">
									{h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</div>
