<script lang="ts">
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { PinInput } from 'bits-ui';

	let email = $state('');
	let otpCode = $state('');
	let ssoEmail = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'choose' | 'otp-email' | 'otp-verify' | 'sso-email' | 'sso-redirect'>('choose');

	import { page } from '$app/stores';
	import { get } from 'svelte/store';

	// Check URL for SSO-required error
	const urlError = get(page).url.searchParams.get('error');
	if (urlError === 'sso_required') {
		error = 'Your organization requires SSO login. Please sign in with SSO.';
	}

	async function signInWithGoogle() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback`
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

		const { error: err } = await supabase.auth.signInWithOtp({
			email,
			options: { shouldCreateUser: false }
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
			window.location.href = '/insight';
		}
	}

	async function discoverSso() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/sso/discover', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: ssoEmail })
			});
			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Failed to check SSO';
				return;
			}

			if (!data.sso) {
				error = 'No SSO provider configured for this email domain';
				return;
			}

			// Redirect to SSO
			mode = 'sso-redirect';
			const { data: ssoData, error: ssoError } = await supabase.auth.signInWithSSO({
				domain: data.domain,
				options: {
					redirectTo: `${window.location.origin}/auth/callback`
				}
			});

			if (ssoError) {
				error = ssoError.message;
				mode = 'sso-email';
				return;
			}

			if (ssoData?.url) {
				window.location.href = ssoData.url;
			}
		} finally {
			loading = false;
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
		Log in to Threadline
	{:else if mode === 'otp-email'}
		Enter your email
	{:else if mode === 'otp-verify'}
		Enter the code sent to {email}
	{:else if mode === 'sso-email'}
		Sign in with SSO
	{:else if mode === 'sso-redirect'}
		Redirecting to your identity provider...
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
			<Button size="lg" onclick={signInWithGoogle} disabled={loading} class="w-full">
				Continue with Google
			</Button>

			<Button size="lg" variant="outline" onclick={() => (mode = 'otp-email')} class="w-full">
				Continue with Email
			</Button>

			<Button size="lg" variant="outline" onclick={() => (mode = 'sso-email')} class="w-full">
				Sign in with SSO
			</Button>
		</div>
	{:else if mode === 'otp-email'}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				sendOtp();
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" type="email" placeholder="you@example.com" bind:value={email} required />
			</div>
			<Button size="lg" type="submit" class="w-full" disabled={loading || !email}>
				{loading ? 'Sending code...' : 'Send sign-in code'}
			</Button>
		</form>
	{:else if mode === 'otp-verify'}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				verifyOtp();
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label>Verification code</Label>
				<PinInput.Root
					maxlength={6}
					bind:value={otpCode}
					onComplete={verifyOtp}
					textalign="center"
					pasteTransformer={(t) => t.replace(/[^0-9]/g, '')}
					class="flex justify-center gap-2.5"
				>
					{#snippet children({ cells })}
						{#each cells as cell (cell)}
							<PinInput.Cell
								{cell}
								class="flex h-12 w-11 items-center justify-center rounded-lg border border-input bg-background text-center text-lg font-medium transition-colors data-[active]:border-ring data-[active]:ring-2 data-[active]:ring-ring/20"
							/>
						{/each}
					{/snippet}
				</PinInput.Root>
			</div>
			<Button size="lg" type="submit" class="w-full" disabled={loading || otpCode.length < 6}>
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
	{:else if mode === 'sso-email'}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				discoverSso();
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="sso-email">Work Email</Label>
				<Input
					id="sso-email"
					type="email"
					placeholder="you@company.com"
					bind:value={ssoEmail}
					required
				/>
				<p class="text-xs text-muted-foreground">
					Enter your work email to be redirected to your company's sign-in page
				</p>
			</div>
			<Button size="lg" type="submit" class="w-full" disabled={loading || !ssoEmail}>
				{loading ? 'Checking...' : 'Continue with SSO'}
			</Button>
		</form>
	{:else if mode === 'sso-redirect'}
		<div class="flex flex-col items-center gap-3 py-4">
			<svg
				class="h-6 w-6 animate-spin text-muted-foreground"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				/>
			</svg>
			<p class="text-sm text-muted-foreground">Redirecting to your identity provider...</p>
		</div>
	{/if}
</div>

<div class="mt-6 flex flex-col items-center gap-2 text-sm">
	{#if mode !== 'choose'}
		<button type="button" class="text-muted-foreground hover:text-foreground" onclick={reset}>
			Back
		</button>
	{/if}
	<a href={resolve('/signup')} class="text-muted-foreground hover:text-foreground">
		Don't have an account? Sign up
	</a>
</div>
