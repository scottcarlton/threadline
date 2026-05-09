<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let email = $state('');
	let otpCode = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'choose' | 'otp-email' | 'otp-verify' | 'google-email'>('choose');

	async function checkWhitelist(emailToCheck: string): Promise<boolean> {
		const res = await fetch('/api/auth/check-whitelist', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: emailToCheck })
		});
		const data = await res.json();
		if (!data.allowed) {
			error = data.message;
			return false;
		}
		return true;
	}

	async function signUpWithGoogle() {
		error = '';
		loading = true;
		const allowed = await checkWhitelist(email);
		if (!allowed) {
			loading = false;
			return;
		}
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
				queryParams: { prompt: 'select_account', login_hint: email }
			}
		});
		loading = false;
		if (err) {
			error = err.message;
		}
	}

	async function sendOtp() {
		error = '';
		loading = true;
		const allowed = await checkWhitelist(email);
		if (!allowed) {
			loading = false;
			return;
		}
		const { error: err } = await supabase.auth.signInWithOtp({
			email,
			options: { shouldCreateUser: true }
		});
		loading = false;
		if (err) {
			error = err.message;
		} else {
			mode = 'otp-verify';
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
			window.location.href = '/onboarding';
		}
	}

	function reset() {
		mode = 'choose';
		otpCode = '';
		error = '';
	}
</script>

<h2 class="mb-6 text-center text-xl font-semibold">
	{#if mode === 'choose'}
		Create an account with Threadline
	{:else if mode === 'otp-email'}
		Enter your email
	{:else if mode === 'google-email'}
		Enter your email
	{:else}
		Enter the code sent to {email}
	{/if}
</h2>

<div>
	{#if error}
		<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if mode === 'choose'}
		<div class="flex flex-col gap-3">
			<Button size="lg" onclick={() => (mode = 'google-email')} disabled={loading} class="w-full">
				Continue with Google
			</Button>

			<Button size="lg" variant="outline" onclick={() => (mode = 'otp-email')} class="w-full">
				Continue with Email
			</Button>
		</div>
	{:else if mode === 'google-email'}
		<form onsubmit={(e) => { e.preventDefault(); signUpWithGoogle(); }} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" type="email" placeholder="you@example.com" bind:value={email} required />
			</div>
			<Button size="lg" type="submit" class="w-full" disabled={loading || !email}>
				{loading ? 'Checking...' : 'Continue with Google'}
			</Button>
		</form>
	{:else if mode === 'otp-email'}
		<form onsubmit={(e) => { e.preventDefault(); sendOtp(); }} class="space-y-4">
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" type="email" placeholder="you@example.com" bind:value={email} required />
			</div>
			<Button size="lg" type="submit" class="w-full" disabled={loading || !email}>
				{loading ? 'Sending code...' : 'Send verification code'}
			</Button>
		</form>
	{:else if mode === 'otp-verify'}
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
			<Button size="lg" type="submit" class="w-full" disabled={loading || !otpCode}>
				{loading ? 'Verifying...' : 'Verify code'}
			</Button>
			<button
				type="button"
				class="w-full text-center text-sm text-muted-foreground hover:text-foreground"
				onclick={sendOtp}
			>
				Resend code
			</button>
		</form>
	{/if}
</div>

<div class="mt-6 flex flex-col items-center gap-2 text-sm">
	{#if mode !== 'choose'}
		<button type="button" class="text-muted-foreground hover:text-foreground" onclick={reset}>
			Back
		</button>
	{/if}
	<a href="/login" class="text-muted-foreground hover:text-foreground">
		Already have an account? Log in
	</a>
</div>
