<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Switch from '$lib/components/ui/switch.svelte';
	import type { UserRole } from '$lib/types/database.js';

	type TerritoryOption = { id: string; name: string; brand_name?: string | null };

	type Props = {
		open: boolean;
		orgType: 'rep' | 'brand';
		brands: { id: string; name: string }[];
		territories?: TerritoryOption[];
		selfBrandId?: string | null;
		fixedRole?: UserRole | null;
		onclose: () => void;
		oninvited: () => void;
	};

	let {
		open,
		orgType,
		brands,
		territories = [],
		selfBrandId = null,
		fixedRole = null,
		onclose,
		oninvited
	}: Props = $props();

	const roles: { value: UserRole; label: string; description: string }[] = [
		{
			value: 'admin',
			label: 'Admin',
			description: 'Full access to all features, billing, and team management'
		},
		{
			value: 'owner',
			label: 'Owner',
			description: 'Full operational access without billing or account deletion'
		},
		{
			value: 'member',
			label: 'Member',
			description: 'Read and write access, optionally scoped to specific brands'
		},
		{
			value: 'sales',
			label: 'Sales',
			description: 'Field rep access scoped to assigned brands and territories'
		},
		{
			value: 'guest',
			label: 'Guest',
			description: 'Read-only access, optionally scoped to specific brands'
		}
	];

	const initialRole = $derived(fixedRole ?? 'member');
	let selectedRole = $state<UserRole | ''>('');
	let email = $state('');
	let selectedBrandIds = $state<string[]>([]);
	let selectedTerritoryIds = $state<string[]>([]);
	let commissionRate = $state('');
	let managesOthers = $state(false);
	let submitting = $state(false);
	let errorMsg = $state('');

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			selectedRole = initialRole || '';
			email = '';
			selectedBrandIds = [];
			selectedTerritoryIds = [];
			commissionRate = '';
			managesOthers = false;
			errorMsg = '';
		}
	});

	const showBrandAccess = $derived(
		orgType === 'rep' &&
			(selectedRole === 'member' || selectedRole === 'sales' || selectedRole === 'guest') &&
			brands.length > 0
	);

	const showCommission = $derived(selectedRole === 'sales');
	const showManagesOthers = $derived(selectedRole === 'member' || selectedRole === 'sales');
	const showTerritories = $derived(selectedRole === 'sales' && territories.length > 0);

	$effect(() => {
		if (!showManagesOthers && managesOthers) managesOthers = false;
	});
	$effect(() => {
		if (!showTerritories && selectedTerritoryIds.length > 0) selectedTerritoryIds = [];
	});

	function toggleTerritory(territoryId: string) {
		if (selectedTerritoryIds.includes(territoryId)) {
			selectedTerritoryIds = selectedTerritoryIds.filter((id) => id !== territoryId);
		} else {
			selectedTerritoryIds = [...selectedTerritoryIds, territoryId];
		}
	}

	function toggleBrand(brandId: string) {
		if (selectedBrandIds.includes(brandId)) {
			selectedBrandIds = selectedBrandIds.filter((id) => id !== brandId);
		} else {
			selectedBrandIds = [...selectedBrandIds, brandId];
		}
	}

	async function handleSubmit() {
		if (!email.trim() || !selectedRole) return;
		submitting = true;
		errorMsg = '';

		const brandIds =
			orgType === 'brand' && selfBrandId ? [selfBrandId] : showBrandAccess ? selectedBrandIds : [];

		const res = await fetch('/api/invite/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: email.trim(),
				role: selectedRole,
				brandIds,
				territoryIds: showTerritories ? selectedTerritoryIds : [],
				commissionRate: showCommission ? parseFloat(commissionRate) || 0 : undefined,
				managesOthers: showManagesOthers ? managesOthers : false
			})
		});

		const result = await res.json();
		submitting = false;

		if (!res.ok) {
			errorMsg = result.error || 'Failed to send invitation.';
			return;
		}

		if (result.autoAdded) {
			toast.success('Added to team', { description: `${email} has been added directly.` });
		} else {
			toast.success('Invite sent', { description: `An invite link was emailed to ${email}.` });
		}

		oninvited();
		onclose();
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') onclose();
	}}
/>

{#if open}
	<div class="fixed inset-0 z-50" role="dialog" aria-modal="true">
		<!-- Overlay -->
		<button
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			onclick={onclose}
			aria-label="Close"
		></button>

		<!-- Modal -->
		<div
			class="absolute inset-6 flex flex-col overflow-hidden border bg-background shadow-2xl"
			role="document"
		>
			<!-- Header -->
			<div class="relative px-12 py-8 text-center">
				<h2 class="text-xl font-semibold">
					{fixedRole ? 'Invite a sales rep' : 'Invite a team member'}
				</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Set their role and permissions before sending the invite
				</p>
				<button
					onclick={onclose}
					class="absolute top-5 right-8 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Scrollable content -->
			<div class="flex-1 overflow-y-auto px-12 py-8">
				<div class="mx-auto max-w-4xl space-y-8">
					<!-- Role -->
					<section class="space-y-3">
						<div>
							<h3 class="text-sm font-medium">Role</h3>
							<p class="text-sm text-muted-foreground">
								{fixedRole
									? 'This person will be invited as a sales rep.'
									: 'Choose what level of access this person should have.'}
							</p>
						</div>
						{#if fixedRole}
							<div class="rounded-lg border border-primary/30 bg-primary/5 p-4">
								<p class="font-medium">
									{roles.find((r) => r.value === fixedRole)?.label}
								</p>
								<p class="mt-0.5 text-sm text-muted-foreground">
									{roles.find((r) => r.value === fixedRole)?.description}
								</p>
							</div>
						{:else}
							<div class="grid gap-3 sm:grid-cols-3">
								{#each roles as role (role.value)}
									<button
										type="button"
										class="rounded-lg border p-4 text-left transition-all {selectedRole ===
										role.value
											? 'border-primary ring-1 ring-primary'
											: 'hover:border-foreground/20'}"
										onclick={() => (selectedRole = role.value)}
									>
										<p class="font-medium">{role.label}</p>
										<p class="mt-0.5 text-sm text-muted-foreground">{role.description}</p>
									</button>
								{/each}
							</div>
						{/if}
					</section>

					<!-- Email + Commission -->
					<section class="space-y-3">
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="invite-email">Email address</Label>
								<Input
									id="invite-email"
									type="email"
									bind:value={email}
									placeholder="name@company.com"
								/>
								<p class="text-sm text-muted-foreground">
									They'll receive an invite link to join your organization.
								</p>
							</div>
							<div class="space-y-2">
								{#if showCommission}
									<Label for="invite-commission">Commission rate (%)</Label>
									<div class="max-w-[120px]">
										<Input
											id="invite-commission"
											type="number"
											min="0"
											max="100"
											step="0.25"
											placeholder="0"
											bind:value={commissionRate}
										/>
									</div>
									<p class="text-sm text-muted-foreground">
										Default commission percentage for this sales rep.
									</p>
								{/if}
							</div>
						</div>
					</section>

					<!-- Manages Others -->
					{#if showManagesOthers}
						<section class="space-y-3">
							<label class="flex items-center justify-between gap-4">
								<div>
									<p class="text-sm font-medium">Manages others</p>
									<p class="text-sm text-muted-foreground">
										Let them invite teammates under them and see data for everyone they manage.
									</p>
								</div>
								<Switch bind:checked={managesOthers} aria-label="Manages others" />
							</label>
						</section>
					{/if}

					<!-- Brand Access -->
					{#if showBrandAccess}
						<section class="space-y-3">
							<div>
								<h3 class="text-sm font-medium">Brand Access</h3>
								<p class="text-sm text-muted-foreground">
									Select which brands this person can access. Leave empty to grant access to all
									brands.
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								{#each brands as brand (brand.id)}
									<button
										type="button"
										class="rounded-lg border px-3 py-1.5 text-sm transition-all {selectedBrandIds.includes(
											brand.id
										)
											? 'border-primary bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
										onclick={() => toggleBrand(brand.id)}
									>
										{brand.name}
									</button>
								{/each}
							</div>
						</section>
					{/if}

					<!-- Territories (Sales only) -->
					{#if showTerritories}
						<section class="space-y-3">
							<div>
								<h3 class="text-sm font-medium">Territories</h3>
								<p class="text-sm text-muted-foreground">
									Assign one or more territories. Leave empty to scope by brand alone.
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								{#each territories as territory (territory.id)}
									<button
										type="button"
										class="rounded-lg border px-3 py-1.5 text-sm transition-all {selectedTerritoryIds.includes(
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
						</section>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="flex flex-col items-center px-12 py-8">
				{#if errorMsg}
					<p class="mb-3 text-sm text-destructive">{errorMsg}</p>
				{/if}
				<div class="flex items-center gap-3">
					<Button variant="ghost" size="lg" class="min-w-[180px]" onclick={onclose}>Cancel</Button>
					<Button
						size="lg"
						class="min-w-[180px]"
						onclick={handleSubmit}
						disabled={submitting || !email.trim() || !selectedRole}
					>
						{submitting ? 'Sending...' : 'Send Invite'}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
