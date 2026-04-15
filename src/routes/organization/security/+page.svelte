<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { OrganizationSsoProvider } from '$lib/types/database.js';

	let { data } = $props();
	const providers = $derived((data.providers ?? []) as OrganizationSsoProvider[]);
	const ssoEnforced = $derived(data.ssoEnforced as boolean);
	const isOwner = $derived(data.isOwner as boolean);

	let showForm = $state(false);
	let domain = $state('');
	let metadataUrl = $state('');
	let displayName = $state('');
	let saving = $state(false);
	let deleting = $state('');
	let toggling = $state(false);
	let error = $state('');

	// Edit state
	let editingId = $state<string | null>(null);
	let editDomain = $state('');
	let editMetadataUrl = $state('');
	let editDisplayName = $state('');

	async function createProvider() {
		error = '';
		saving = true;
		try {
			const res = await fetch('/api/sso/providers', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain, metadataUrl, displayName: displayName || undefined })
			});
			const json = await res.json();
			if (!res.ok) {
				error = json.error || 'Failed to create SSO provider';
				return;
			}
			domain = '';
			metadataUrl = '';
			displayName = '';
			showForm = false;
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	function startEdit(provider: OrganizationSsoProvider) {
		editingId = provider.id;
		editDomain = provider.domain;
		editMetadataUrl = provider.metadata_url ?? '';
		editDisplayName = provider.display_name ?? '';
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveEdit() {
		if (!editingId) return;
		error = '';
		saving = true;
		try {
			const res = await fetch(`/api/sso/providers/${editingId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					domain: editDomain,
					metadataUrl: editMetadataUrl,
					displayName: editDisplayName || undefined
				})
			});
			const json = await res.json();
			if (!res.ok) {
				error = json.error || 'Failed to update SSO provider';
				return;
			}
			editingId = null;
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	async function deleteProvider(id: string) {
		error = '';
		deleting = id;
		try {
			const res = await fetch(`/api/sso/providers/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const json = await res.json();
				error = json.error || 'Failed to delete SSO provider';
				return;
			}
			await invalidateAll();
		} finally {
			deleting = '';
		}
	}

	async function toggleEnforcement() {
		error = '';
		toggling = true;
		try {
			const res = await fetch('/api/sso/enforce', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enforced: !ssoEnforced })
			});
			const json = await res.json();
			if (!res.ok) {
				error = json.error || 'Failed to update enforcement';
				return;
			}
			await invalidateAll();
		} finally {
			toggling = false;
		}
	}
</script>

<div class="space-y-8">
	<div>
		<h2 class="text-lg font-semibold">Security</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Configure single sign-on and security policies for your organization
		</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}

	<!-- SAML Identity Providers -->
	<div>
		<h2 class="mb-3 text-sm font-medium tracking-wider text-muted-foreground uppercase">
			SAML Identity Provider
		</h2>

		{#if providers.length === 0 && !showForm}
			<Card>
				<CardContent class="py-8">
					<div class="flex flex-col items-center text-center">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 text-muted-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
								/>
							</svg>
						</div>
						<h3 class="mt-3 text-sm font-medium">No SSO provider configured</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							Connect a SAML identity provider to enable SSO for your team
						</p>
						<div class="mt-4">
							<Button variant="outline" size="sm" onclick={() => (showForm = true)}>
								Add SAML Provider
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		{/if}

		{#each providers as provider (provider.id)}
			<Card class="mb-4">
				<CardContent class="pt-5 pb-5">
					{#if editingId === provider.id}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								saveEdit();
							}}
							class="space-y-4"
						>
							<div class="space-y-2">
								<Label for="edit-domain">Email Domain</Label>
								<Input
									id="edit-domain"
									type="text"
									placeholder="acme.com"
									bind:value={editDomain}
									required
								/>
							</div>
							<div class="space-y-2">
								<Label for="edit-metadata">IdP Metadata URL</Label>
								<Input
									id="edit-metadata"
									type="url"
									placeholder="https://idp.example.com/metadata.xml"
									bind:value={editMetadataUrl}
									required
								/>
							</div>
							<div class="space-y-2">
								<Label for="edit-name">Display Name (optional)</Label>
								<Input
									id="edit-name"
									type="text"
									placeholder="e.g. Okta, Azure AD"
									bind:value={editDisplayName}
								/>
							</div>
							<div class="flex gap-2">
								<Button
									type="submit"
									size="sm"
									disabled={saving || !editDomain || !editMetadataUrl}
								>
									{saving ? 'Saving...' : 'Save Changes'}
								</Button>
								<Button type="button" variant="outline" size="sm" onclick={cancelEdit}>
									Cancel
								</Button>
							</div>
						</form>
					{:else}
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="text-sm font-medium">{provider.display_name || 'SAML Provider'}</p>
									<span
										class="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
										>Active</span
									>
								</div>
								<div class="mt-2 space-y-1">
									<p class="text-sm text-muted-foreground">
										<span class="font-medium text-foreground">Domain:</span>
										{provider.domain}
									</p>
									{#if provider.metadata_url}
										<p class="truncate text-sm text-muted-foreground">
											<span class="font-medium text-foreground">Metadata:</span>
											{provider.metadata_url}
										</p>
									{/if}
								</div>
							</div>
							<div class="flex shrink-0 gap-2">
								<Button variant="outline" size="sm" onclick={() => startEdit(provider)}>
									Edit
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="text-destructive hover:text-destructive"
									disabled={deleting === provider.id}
									onclick={() => deleteProvider(provider.id)}
								>
									{deleting === provider.id ? 'Deleting...' : 'Delete'}
								</Button>
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/each}

		{#if showForm}
			<Card>
				<CardContent class="pt-5 pb-5">
					<form
						onsubmit={(e) => {
							e.preventDefault();
							createProvider();
						}}
						class="space-y-4"
					>
						<div class="space-y-2">
							<Label for="domain">Email Domain</Label>
							<Input id="domain" type="text" placeholder="acme.com" bind:value={domain} required />
							<p class="text-xs text-muted-foreground">
								The email domain that will trigger SSO login (e.g. acme.com)
							</p>
						</div>
						<div class="space-y-2">
							<Label for="metadata">IdP Metadata URL</Label>
							<Input
								id="metadata"
								type="url"
								placeholder="https://idp.example.com/metadata.xml"
								bind:value={metadataUrl}
								required
							/>
							<p class="text-xs text-muted-foreground">
								Your identity provider's SAML metadata URL
							</p>
						</div>
						<div class="space-y-2">
							<Label for="name">Display Name (optional)</Label>
							<Input
								id="name"
								type="text"
								placeholder="e.g. Okta, Azure AD"
								bind:value={displayName}
							/>
						</div>
						<div class="flex gap-2">
							<Button type="submit" size="sm" disabled={saving || !domain || !metadataUrl}>
								{saving ? 'Creating...' : 'Add Provider'}
							</Button>
							<Button type="button" variant="outline" size="sm" onclick={() => (showForm = false)}>
								Cancel
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		{/if}

		{#if providers.length > 0 && !showForm}
			<div class="mt-2">
				<Button variant="outline" size="sm" onclick={() => (showForm = true)}>
					Add Another Domain
				</Button>
			</div>
		{/if}
	</div>

	<!-- SSO Enforcement -->
	{#if isOwner && providers.length > 0}
		<div>
			<h2 class="mb-3 text-sm font-medium tracking-wider text-muted-foreground uppercase">
				SSO Enforcement
			</h2>
			<Card>
				<CardContent class="pt-5 pb-5">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-sm font-medium">Require SSO for all organization members</p>
							<p class="mt-1 text-sm text-muted-foreground">
								When enabled, members with emails matching your SSO domain must sign in via SSO.
								Email and OTP login will be blocked for these users.
							</p>
							{#if ssoEnforced}
								<p class="mt-2 text-xs text-amber-600">
									SSO is enforced. Members with matching email domains can only sign in through your
									identity provider.
								</p>
							{/if}
						</div>
						<Button
							variant={ssoEnforced ? 'destructive' : 'outline'}
							size="sm"
							class="shrink-0"
							disabled={toggling}
							onclick={toggleEnforcement}
						>
							{#if toggling}
								Updating...
							{:else if ssoEnforced}
								Disable
							{:else}
								Enable
							{/if}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}
</div>
