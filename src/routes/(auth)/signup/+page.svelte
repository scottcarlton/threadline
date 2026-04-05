<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card/index.js';

	let displayName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let orgName = $state('');
	let error = $state('');
	let loading = $state(false);
	let step = $state<'details' | 'verify'>('details');
	let otpCode = $state('');

	async function handleSignup() {
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		loading = true;

		// Create the auth user
		const { data: authData, error: authError } = await supabase.auth.signUp({
			email,
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

		// Create org and membership via server endpoint
		const res = await fetch('/api/signup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				orgName,
				userId: authData.user.id
			})
		});

		if (!res.ok) {
			const data = await res.json();
			error = data.error || 'Failed to create organization';
			loading = false;
			return;
		}

		loading = false;
		step = 'verify';
	}

	async function verifyEmail() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.verifyOtp({
			email,
			token: otpCode,
			type: 'email'
		});
		loading = false;
		if (err) {
			error = err.message;
		} else {
			goto('/dashboard');
		}
	}

	function skipVerification() {
		// In local dev, email verification may be disabled
		goto('/dashboard');
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>{step === 'details' ? 'Create your account' : 'Verify your email'}</CardTitle>
		<CardDescription>
			{#if step === 'details'}
				Set up your business on ThreadLine
			{:else}
				We sent a code to {email}
			{/if}
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if error}
			<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		{#if step === 'details'}
			<form onsubmit={(e) => { e.preventDefault(); handleSignup(); }} class="space-y-4">
				<div class="space-y-2">
					<Label for="display-name">Your name</Label>
					<Input id="display-name" placeholder="Jane Smith" bind:value={displayName} required />
				</div>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" placeholder="you@example.com" bind:value={email} required />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input id="password" type="password" placeholder="Min 8 characters" bind:value={password} required />
				</div>
				<div class="space-y-2">
					<Label for="confirm-password">Confirm password</Label>
					<Input id="confirm-password" type="password" placeholder="Confirm password" bind:value={confirmPassword} required />
				</div>
				<div class="space-y-2">
					<Label for="org-name">Business name</Label>
					<Input id="org-name" placeholder="Your Company Inc." bind:value={orgName} required />
				</div>
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Creating account...' : 'Create account'}
				</Button>
			</form>
		{:else}
			<form onsubmit={(e) => { e.preventDefault(); verifyEmail(); }} class="space-y-4">
				<div class="space-y-2">
					<Label for="otp">Verification code</Label>
					<Input
						id="otp"
						type="text"
						placeholder="Enter 6-digit code"
						bind:value={otpCode}
						autocomplete="one-time-code"
						required
					/>
				</div>
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Verifying...' : 'Verify email'}
				</Button>
				<Button variant="ghost" class="w-full" type="button" onclick={skipVerification}>
					Skip for now
				</Button>
			</form>
		{/if}
	</CardContent>
	<CardFooter>
		<div class="flex w-full justify-center text-sm">
			<a href="/login" class="text-muted-foreground hover:text-foreground">
				Already have an account? Sign in
			</a>
		</div>
	</CardFooter>
</Card>
