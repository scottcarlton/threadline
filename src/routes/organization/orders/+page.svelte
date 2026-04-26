<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { organizationOrdersSchema } from '$lib/schemas/organization-orders.js';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(organizationOrdersSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		onUpdated: ({ form }) => {
			if (form.valid && form.message?.success) {
				toast.success('Order defaults updated.');
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Failed to save changes.');
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

	<form method="POST" use:enhance class="space-y-8">
		<!-- Order number format -->
		<section class="space-y-4">
			<h3 class="text-sm font-semibold">Order number format</h3>
			<div class="grid grid-cols-[120px_1fr] gap-3">
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
			</div>
			<p class="text-sm text-muted-foreground">
				Sample: <span class="font-mono">{$form.orderNumberPrefix}{$form.nextOrderNumber}</span>
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
						disabled={!$form.orderMinimumEnabled}
						class="w-40"
						aria-invalid={$errors.orderMinimumAmount ? 'true' : undefined}
					/>
				</div>
				{#if $errors.orderMinimumAmount}
					<p class="text-sm text-destructive">{$errors.orderMinimumAmount[0]}</p>
				{/if}
			</div>
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
			<h3 class="text-sm font-semibold">Handling fee</h3>
			<p class="text-sm text-muted-foreground">
				Flat fee added to every new order. Set to 0 to disable.
			</p>
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
		</section>

		<div>
			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</form>
</div>
