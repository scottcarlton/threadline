<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Switch from '$lib/components/ui/switch.svelte';
	import { PAYMENT_METHODS, PAYMENT_TERMS } from '$lib/payment-methods';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { organizationPaymentsSchema } from '$lib/schemas/organization-payments.js';

	let { data } = $props();

	const stripeAccountId = $derived(data.stripeAccountId);

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(organizationPaymentsSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Payments updated.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save changes.');
			}
		}
	});

	const termOptions = $derived([
		{ value: '', label: 'None' },
		...PAYMENT_TERMS.map((t) => ({ value: t.code, label: t.label }))
	]);

	function toggleAcceptedMethod(code: string, next: boolean) {
		const current = $form.acceptedMethods;
		if (next) {
			$form.acceptedMethods = current.includes(code) ? current : [...current, code];
		} else {
			$form.acceptedMethods = current.filter((c) => c !== code);
			if ($form.defaultMethod === code) $form.defaultMethod = '';
		}
	}
</script>

<div class="max-w-2xl space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Payments</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Processor, accepted methods, default terms, and deposits.
		</p>
	</div>

	<form method="POST" use:enhance class="space-y-8">
		<!-- Connected processor -->
		<section class="space-y-4 rounded-md border p-4">
			<div>
				<h3 class="text-sm font-semibold">Connected processor</h3>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Connect Stripe to accept card payments. Stripe Link lets returning buyers pay faster.
				</p>
			</div>

			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-sm font-medium">Stripe</p>
					<p class="mt-0.5 text-sm text-muted-foreground">
						{#if stripeAccountId}
							Connected
						{:else}
							Not connected
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button type="button" variant="outline" disabled>Connect Stripe</Button>
					<span
						class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
					>
						Coming soon
					</span>
				</div>
			</div>

			<div class="flex items-center justify-between gap-3 border-t pt-4">
				<div>
					<p class="text-sm font-medium">Stripe Link</p>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Faster checkout for returning buyers. Requires Stripe.
					</p>
				</div>
				<Switch
					checked={$form.stripeLinkEnabled}
					onCheckedChange={(v) => ($form.stripeLinkEnabled = v)}
					disabled
				/>
			</div>
		</section>

		<!-- Accepted methods -->
		<section class="space-y-4">
			<div>
				<h3 class="text-sm font-semibold">Accepted methods</h3>
				<p class="mt-0.5 text-sm text-muted-foreground">
					What buyers can choose at checkout. The default is pre-selected on new orders.
				</p>
			</div>

			<ul class="divide-y rounded-md border">
				{#each PAYMENT_METHODS as method (method.code)}
					{@const accepted = $form.acceptedMethods.includes(method.code)}
					{@const isDefault = $form.defaultMethod === method.code}
					<li class="flex items-center gap-4 px-4 py-3">
						<Checkbox
							checked={accepted}
							onCheckedChange={(v) => toggleAcceptedMethod(method.code, v)}
						/>
						<span class="flex-1 text-sm font-medium">{method.label}</span>
						{#if isDefault}
							<span
								class="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-sm font-medium text-background"
							>
								<span class="h-1.5 w-1.5 rounded-full bg-background"></span>
								Default
							</span>
						{:else}
							<button
								type="button"
								disabled={!accepted}
								onclick={() => ($form.defaultMethod = method.code)}
								class="rounded-full border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:text-muted-foreground"
							>
								Set default
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if $errors.defaultMethod}
				<p class="text-sm text-destructive">{$errors.defaultMethod[0]}</p>
			{/if}
		</section>

		<!-- Default term -->
		<section class="space-y-4">
			<div>
				<h3 class="text-sm font-semibold">Default payment terms</h3>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Pre-selected on new orders. Override per order at finalize.
				</p>
			</div>
			<div class="space-y-2">
				<Label for="default-term">Term</Label>
				<SelectField
					bind:value={$form.defaultTerm}
					items={termOptions}
					placeholder="None"
					class="w-64"
				/>
			</div>
		</section>

		<!-- Required deposit -->
		<section class="space-y-4 rounded-md border p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">Required deposit</h3>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Buyers pay a percentage up front before the order is confirmed.
					</p>
				</div>
				<Switch
					checked={$form.requiredDepositEnabled}
					onCheckedChange={(v) => ($form.requiredDepositEnabled = v)}
				/>
			</div>

			{#if $form.requiredDepositEnabled}
				<div class="space-y-4 border-t pt-4">
					<div class="space-y-2">
						<Label for="deposit-percent">Percent</Label>
						<div class="flex items-center gap-2">
							<Input
								id="deposit-percent"
								type="number"
								min={0}
								max={100}
								step={0.25}
								bind:value={$form.requiredDepositPercent}
								class="w-28"
								aria-invalid={$errors.requiredDepositPercent ? 'true' : undefined}
							/>
							<span class="text-sm text-muted-foreground">%</span>
						</div>
						{#if $errors.requiredDepositPercent}
							<p class="text-sm text-destructive">{$errors.requiredDepositPercent[0]}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label>Deposit account</Label>
						<div class="flex items-center justify-between gap-3 rounded-md border p-3">
							<div>
								<p class="text-sm font-medium">
									{$form.depositAccountName || 'No account connected'}
								</p>
								{#if data.depositAccountLast4}
									<p class="mt-0.5 text-sm text-muted-foreground">
										····{data.depositAccountLast4}
									</p>
								{:else}
									<p class="mt-0.5 text-sm text-muted-foreground">
										Connect a bank account to receive deposits.
									</p>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								<Button type="button" variant="outline" disabled>Connect with Plaid</Button>
								<span
									class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
								>
									Coming soon
								</span>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</section>

		<!-- Surcharge -->
		<section>
			<label class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-medium">Pass processing surcharge to buyer</p>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Adds the processor's fee as a separate line at checkout. Off means you absorb it.
					</p>
				</div>
				<Switch
					checked={$form.surchargePassToBuyer}
					onCheckedChange={(v) => ($form.surchargePassToBuyer = v)}
				/>
			</label>
		</section>

		<div>
			<Button type="submit" loading={$submitting} class="w-full sm:w-auto">Save changes</Button>
		</div>
	</form>
</div>
