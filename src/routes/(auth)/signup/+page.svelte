<script lang="ts">
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { PinInput } from 'bits-ui';

	let email = $state('');
	let otpCode = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'choose' | 'otp-email' | 'otp-verify'>('choose');

	async function signUpWithGoogle() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
				queryParams: { prompt: 'select_account' }
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
	{/if}
</div>

<div class="mt-6 flex flex-col items-center gap-2 text-sm">
	{#if mode !== 'choose'}
		<button type="button" class="text-muted-foreground hover:text-foreground" onclick={reset}>
			Back
		</button>
	{/if}
	<a href={resolve('/login')} class="text-muted-foreground hover:text-foreground">
		Already have an account? Log in
	</a>
</div>
