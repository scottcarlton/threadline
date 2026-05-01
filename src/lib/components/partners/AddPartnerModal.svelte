<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { superForm, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import { inviteEmailSchema, type InviteEmailInput } from '$lib/schemas/invite-email.js';

	type Territory = { id: string; name: string; brand_name?: string | null };

	type Props = {
		open: boolean;
		emailForm: SuperValidated<InviteEmailInput>;
		defaultCommissionRate: number;
		territories?: Territory[];
		onOpenChange: (open: boolean) => void;
	};
	let {
		open = $bindable(),
		emailForm,
		defaultCommissionRate,
		territories = [],
		onOpenChange
	}: Props = $props();

	const presets = [8, 10, 12, 14];

	let customMode = $state(false);
	let customRate = $state(0);
	let selectedRate = $state(0);

	let managesOthers = $state(false);
	let selectedTerritoryIds = $state<string[]>([]);

	let generating = $state(false);
	let generated = $state<{ url: string; code: string; rate: number } | null>(null);
	let errorMsg = $state('');

	let copied = $state(false);
	let emailOpen = $state(false);

	$effect(() => {
		if (open) {
			const rate = defaultCommissionRate;
			if (presets.includes(rate)) {
				selectedRate = rate;
				customMode = false;
				customRate = rate;
			} else {
				customMode = true;
				customRate = rate;
				selectedRate = rate;
			}
			managesOthers = false;
			selectedTerritoryIds = [];
			generated = null;
			errorMsg = '';
			copied = false;
			emailOpen = false;
		}
	});

	function toggleTerritory(territoryId: string) {
		if (selectedTerritoryIds.includes(territoryId)) {
			selectedTerritoryIds = selectedTerritoryIds.filter((id) => id !== territoryId);
		} else {
			selectedTerritoryIds = [...selectedTerritoryIds, territoryId];
		}
	}

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

	async function generateLink() {
		generating = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/connections/share', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					commissionRate: selectedRate,
					managesOthers,
					territoryIds: selectedTerritoryIds
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				errorMsg = body.error ?? 'Failed to generate link';
				return;
			}
			const payload = (await res.json()) as { url: string; code: string; commissionRate: number };
			generated = { url: payload.url, code: payload.code, rate: payload.commissionRate };
			emailOpen = false;
		} catch {
			errorMsg = "Couldn't reach the server. Try again.";
		} finally {
			generating = false;
		}
	}

	async function copyLink() {
		if (!generated) return;
		try {
			await navigator.clipboard.writeText(generated.url);
			copied = true;
			toast.success('Link copied');
			setTimeout(() => (copied = false), 1500);
		} catch {
			toast.error("Couldn't copy the link — try selecting it manually.");
		}
	}

	// svelte-ignore state_referenced_locally
	const {
		form: emailFormData,
		errors: emailErrors,
		enhance: emailEnhance,
		submitting: emailSubmitting,
		reset: resetEmail
	} = superForm(emailForm, {
		validators: zod4Client(inviteEmailSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form }) => {
			const msg = form.message as { sent?: boolean; recipient?: string } | undefined;
			if (msg?.sent && msg.recipient) {
				toast.success(`Invite sent to ${msg.recipient}`);
				emailOpen = false;
				resetEmail();
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Failed to send email');
		}
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-lg font-semibold">Invite a partner</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Generate a link that lets a sales rep connect to your organization at a set commission rate.
			</Dialog.Description>

			<div class="mt-5 space-y-5">
				<div>
					<Label>Commission rate</Label>
					<div class="mt-2 grid grid-cols-5 gap-2">
						{#each presets as rate (rate)}
							<button
								type="button"
								class="rounded-md px-4 py-3 text-base font-medium transition-colors {!customMode &&
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
							class="rounded-md px-4 py-3 text-base font-medium transition-colors {customMode
								? 'bg-foreground text-background'
								: 'bg-muted text-muted-foreground hover:text-foreground'}"
							onclick={pickCustom}
						>
							Custom
						</button>
					</div>

					{#if customMode}
						<div class="mt-3 flex items-center gap-2">
							<input
								type="number"
								min="0"
								max="100"
								step="0.25"
								value={customRate}
								oninput={onCustomInput}
								class="w-28 rounded-md border border-input bg-background px-3 py-2.5 text-base shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
								aria-label="Custom commission rate"
							/>
							<span class="text-base text-muted-foreground">%</span>
						</div>
					{/if}
				</div>

				<label class="flex items-center justify-between gap-4">
					<div>
						<p class="text-sm font-medium">Manages others</p>
						<p class="text-sm text-muted-foreground">
							Let this partner invite teammates under them and see their data.
						</p>
					</div>
					<Switch bind:checked={managesOthers} aria-label="Manages others" />
				</label>

				{#if territories.length > 0}
					<div>
						<Label>Territories</Label>
						<p class="mt-0.5 text-sm text-muted-foreground">
							Assign one or more territories. Leave empty to scope by brand alone.
						</p>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each territories as territory (territory.id)}
								<button
									type="button"
									class="rounded-md border px-3 py-1.5 text-sm transition-colors {selectedTerritoryIds.includes(
										territory.id
									)
										? 'border-primary bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
									onclick={() => toggleTerritory(territory.id)}
								>
									{territory.name}{territory.brand_name ? ` — ${territory.brand_name}` : ''}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if !generated}
					<Button onclick={generateLink} disabled={generating} class="w-full">
						{generating ? 'Generating…' : 'Generate link'}
					</Button>
				{:else}
					<div class="space-y-3 rounded-md border bg-muted/30 p-3">
						<p class="text-sm font-medium">
							Partner link · {generated.rate}% commission
						</p>
						<div class="flex items-stretch gap-2 rounded-md border bg-background p-2">
							<input
								type="text"
								readonly
								value={generated.url}
								onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
								aria-label="Generated partner link"
								class="min-w-0 flex-1 truncate bg-transparent font-mono text-sm focus:outline-none"
							/>
						</div>
						<div class="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" onclick={copyLink}>
								{copied ? 'Copied' : 'Copy link'}
							</Button>
							<Button variant="outline" size="sm" onclick={() => (emailOpen = !emailOpen)}>
								{emailOpen ? 'Hide email' : 'Email link'}
							</Button>
							<Button variant="ghost" size="sm" onclick={generateLink} disabled={generating}>
								{generating ? 'Regenerating…' : 'Regenerate'}
							</Button>
						</div>
					</div>

					{#if emailOpen}
						<form
							method="POST"
							action="?/sendInviteEmail"
							use:emailEnhance
							class="space-y-2 rounded-md border p-4"
						>
							<input type="hidden" name="code" value={generated.code} />
							<Label for="partner-email-recipient">Recipient email</Label>
							<div class="flex items-start gap-2">
								<div class="flex-1 space-y-1.5">
									<Input
										id="partner-email-recipient"
										name="recipient_email"
										type="email"
										placeholder="name@example.com"
										bind:value={$emailFormData.recipient_email}
										aria-invalid={$emailErrors.recipient_email ? 'true' : undefined}
									/>
									{#if $emailErrors.recipient_email}
										<p class="text-sm text-destructive">{$emailErrors.recipient_email[0]}</p>
									{/if}
								</div>
								<Button type="submit" loading={$emailSubmitting}>Send invite</Button>
							</div>
						</form>
					{/if}
				{/if}

				{#if errorMsg}
					<p class="text-sm text-destructive">{errorMsg}</p>
				{/if}

				<p class="text-sm text-muted-foreground">
					Anyone with this link can connect their rep organization to yours at the selected
					commission rate. Treat it like a password — share it only with reps you intend to partner
					with. You can revoke a partner's access from this page after they connect.
				</p>
			</div>

			<div class="mt-6 flex justify-end">
				<Button variant="outline" onclick={() => onOpenChange(false)} class="min-w-32">Done</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
