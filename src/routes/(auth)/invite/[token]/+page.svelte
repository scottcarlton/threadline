<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data } = $props();
	const invitation = $derived(data.invitation);

	let displayName = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function acceptInvite() {
		error = '';
		loading = true;

		// Sign up with the invited email
		const { data: authData, error: authError } = await supabase.auth.signUp({
			email: invitation.email,
			password,
			options: {
				data: { display_name: displayName }
			}
		});

		if (authError) {
			error = authError.message;
			loading = false;
			return;
		}

		if (!authData.user) {
			error = 'Failed to create account';
			loading = false;
			return;
		}

		// Accept invitation via server endpoint
		const res = await fetch('/api/invite/accept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				token: invitation.token,
				userId: authData.user.id
			})
		});

		if (!res.ok) {
			const data = await res.json();
			error = data.error || 'Failed to accept invitation';
			loading = false;
			return;
		}

		loading = false;
		goto('/dashboard');
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>You're invited to {invitation.orgName}</CardTitle>
		<CardDescription>
			<span class="flex items-center gap-2">
				You'll join as a <Badge variant="secondary">{invitation.role}</Badge>
			</span>
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if error}
			<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); acceptInvite(); }} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" type="email" value={invitation.email} disabled />
			</div>
			<div class="space-y-2">
				<Label for="display-name">Your name</Label>
				<Input id="display-name" placeholder="Jane Smith" bind:value={displayName} required />
			</div>
			<div class="space-y-2">
				<Label for="password">Create a password</Label>
				<Input id="password" type="password" placeholder="Min 8 characters" bind:value={password} required />
			</div>
			<Button type="submit" class="w-full" disabled={loading}>
				{loading ? 'Joining...' : 'Accept invitation'}
			</Button>
		</form>
	</CardContent>
</Card>
