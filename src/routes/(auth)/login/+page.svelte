<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card/index.js';

	let email = $state('');
	let password = $state('');
	let otpCode = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'choose' | 'password' | 'otp-sent'>('choose');

	async function signInWithPassword() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithPassword({ email, password });
		loading = false;
		if (err) {
			error = err.message;
		} else {
			goto('/dashboard');
		}
	}

	async function sendOtp() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOtp({
			email,
			options: { shouldCreateUser: false }
		});
		loading = false;
		if (err) {
			error = err.message;
		} else {
			mode = 'otp-sent';
		}
	}

	async function verifyOtp() {
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

	function reset() {
		mode = 'choose';
		password = '';
		otpCode = '';
		error = '';
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Sign in</CardTitle>
		<CardDescription>
			{#if mode === 'choose'}
				Enter your email to get started
			{:else if mode === 'password'}
				Enter your password
			{:else}
				Enter the code sent to {email}
			{/if}
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if error}
			<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		{#if mode === 'choose'}
			<form onsubmit={(e) => { e.preventDefault(); mode = 'password'; }} class="space-y-4">
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" placeholder="you@example.com" bind:value={email} required />
				</div>
				<div class="flex flex-col gap-2">
					<Button type="submit" disabled={!email}>Continue with password</Button>
					<Button variant="outline" type="button" disabled={!email} onclick={sendOtp}>
						Send me a code instead
					</Button>
				</div>
			</form>
		{:else if mode === 'password'}
			<form onsubmit={(e) => { e.preventDefault(); signInWithPassword(); }} class="space-y-4">
				<div class="space-y-2">
					<Label for="email-display">Email</Label>
					<Input id="email-display" type="email" value={email} disabled />
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input id="password" type="password" placeholder="Enter your password" bind:value={password} required />
				</div>
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Signing in...' : 'Sign in'}
				</Button>
			</form>
		{:else if mode === 'otp-sent'}
			<form onsubmit={(e) => { e.preventDefault(); verifyOtp(); }} class="space-y-4">
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
					{loading ? 'Verifying...' : 'Verify code'}
				</Button>
			</form>
		{/if}
	</CardContent>
	<CardFooter>
		<div class="flex w-full flex-col items-center gap-2 text-sm">
			{#if mode !== 'choose'}
				<button type="button" class="text-muted-foreground hover:text-foreground" onclick={reset}>
					Back to email
				</button>
			{/if}
			<a href="/signup" class="text-muted-foreground hover:text-foreground">
				Don't have an account? Sign up
			</a>
		</div>
	</CardFooter>
</Card>
