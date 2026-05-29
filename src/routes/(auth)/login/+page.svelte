<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { PinInput } from 'bits-ui';

	let email = $state('');
	let otpCode = $state('');
	let ssoEmail = $state('');
	let error = $state('');
	let loading = $state(false);
	let showOtherMethods = $state(false);
	let mode = $state<'choose' | 'otp-email' | 'otp-verify' | 'sso-email' | 'sso-redirect'>('choose');

	import { page } from '$app/stores';
	import { get } from 'svelte/store';

	const errorMessages: Record<string, string> = {
		sso_required: 'Your organization requires SSO. Please sign in with SSO below.',
		auth_failed: 'Sign-in could not be completed. Please try again.',
		invitation_invalid: 'That invitation link is no longer valid.',
		invitation_expired: 'That invitation has expired. Ask your admin to send a new one.',
		invite_accept_failed:
			'Something went wrong accepting that invitation. Please try again or contact your admin.',
		beta_not_whitelisted:
			"Threadline is currently in private beta. If you'd like access, reach out to hello@threadline.systems."
	};

	const urlError = get(page).url.searchParams.get('error');
	const urlErrorMessage = urlError ? (errorMessages[urlError] ?? null) : null;

	if (urlError === 'sso_required') {
		mode = 'sso-email';
	}

	async function signInWithGoogle() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
				queryParams: { prompt: 'select_account' }
			}
		});
		loading = false;
		if (err) error = err.message;
	}

	async function signInWithMicrosoft() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'azure',
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
				scopes: 'email profile openid'
			}
		});
		loading = false;
		if (err) error = err.message;
	}

	async function sendOtp() {
		error = '';
		loading = true;
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
		showOtherMethods = false;
		otpCode = '';
		error = '';
	}
</script>

<div class="mb-6 text-center">
	<h2 class="text-xl font-semibold">
		{#if mode === 'choose'}
			Welcome to Threadline
		{:else if mode === 'otp-email'}
			Enter your email
		{:else if mode === 'otp-verify'}
			Enter the code sent to {email}
		{:else if mode === 'sso-redirect'}
			Redirecting to your identity provider...
		{/if}
	</h2>
	{#if mode === 'choose'}
		<p class="mt-1 text-sm text-muted-foreground">Sign in or create a Threadline account</p>
	{/if}
</div>

<div>
	{#if urlErrorMessage}
		<Alert variant="destructive" class="mb-4">
			<AlertDescription>{urlErrorMessage}</AlertDescription>
		</Alert>
	{/if}

	{#if error}
		<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if mode === 'choose'}
		<div class="flex flex-col gap-3">
			<Button size="lg" onclick={signInWithGoogle} disabled={loading} class="w-full">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24">
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						fill="#4285F4"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						fill="#34A853"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						fill="#FBBC05"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						fill="#EA4335"
					/>
				</svg>
				Continue with Google
			</Button>

			{#if showOtherMethods}
				<Button
					size="lg"
					variant="outline"
					onclick={signInWithMicrosoft}
					disabled={loading}
					class="w-full"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 23 23">
						<path fill="#f35325" d="M1 1h10v10H1z" />
						<path fill="#81bc06" d="M12 1h10v10H12z" />
						<path fill="#05a6f0" d="M1 12h10v10H1z" />
						<path fill="#ffba08" d="M12 12h10v10H12z" />
					</svg>
					Continue with Microsoft
				</Button>

				<Button size="lg" variant="outline" onclick={() => (mode = 'otp-email')} class="w-full">
					Continue with Email
				</Button>

				<button
					type="button"
					class="mt-1 text-sm text-muted-foreground hover:text-foreground"
					onclick={() => (showOtherMethods = false)}
				>
					Fewer options
				</button>
			{:else}
				<button
					type="button"
					class="mt-1 text-sm text-muted-foreground hover:text-foreground"
					onclick={() => (showOtherMethods = true)}
				>
					Show other sign in options
				</button>
			{/if}
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
								class="flex h-12 w-11 items-center justify-center rounded-lg border border-input bg-background text-center text-lg font-medium text-foreground transition-colors data-[active]:border-ring data-[active]:ring-2 data-[active]:ring-ring/20"
							>
								{cell.char ?? ''}
							</PinInput.Cell>
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
				<p class="text-sm text-muted-foreground">
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

{#if mode !== 'choose'}
	<div class="mt-6 text-center">
		<button
			type="button"
			class="text-sm text-muted-foreground hover:text-foreground"
			onclick={reset}
		>
			Back
		</button>
	</div>
{/if}
