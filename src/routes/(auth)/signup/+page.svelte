<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { dev } from '$app/environment';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let email = $state('');
	let otpCode = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'choose' | 'otp-email' | 'otp-verify'>('choose');
	let devOtp = $state<string | null>(null);

	async function signUpWithGoogle() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`
			}
		});
		loading = false;
		if (err) {
			error = err.message;
		}
	}

	async function sendOtp() {
		error = '';
		devOtp = null;
		loading = true;

		if (dev) {
			try {
				const res = await fetch('/api/dev/signup-otp', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email })
				});
				const raw = await res.text();
				let body: { otp?: string; error?: string } = {};
				try {
					body = JSON.parse(raw);
				} catch {
					/* keep raw for error display */
				}
				if (!res.ok || !body.otp) {
					loading = false;
					error =
						body.error ??
						`Dev OTP failed (${res.status}): ${raw.slice(0, 300) || '<empty response>'}`;
					return;
				}
				devOtp = body.otp;
				mode = 'otp-verify';
				loading = false;
				return;
			} catch (e) {
				loading = false;
				error = e instanceof Error ? e.message : 'Failed to generate dev OTP';
				return;
			}
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
			<Button size="lg" onclick={signUpWithGoogle} disabled={loading} class="w-full">
				Continue with Google
			</Button>

			<Button size="lg" variant="outline" onclick={() => (mode = 'otp-email')} class="w-full">
				Continue with Email
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
				{loading ? 'Sending code...' : 'Send verification code'}
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
			{#if dev && devOtp}
				<div class="rounded-md border border-dashed border-amber-400 bg-amber-50 p-3 text-sm">
					<p class="font-semibold text-amber-900">Dev mode</p>
					<p class="text-amber-900">
						Email isn't wired up yet. Your code is
						<button
							type="button"
							class="font-mono underline"
							onclick={() => {
								otpCode = devOtp ?? '';
							}}
						>
							{devOtp}
						</button>
						&nbsp;(click to fill).
					</p>
				</div>
			{/if}
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
