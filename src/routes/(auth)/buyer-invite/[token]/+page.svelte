<script lang="ts">
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';

	let { data } = $props();
	const invitation = $derived(data.invitation);

	let displayName = $state('');
	let otpCode = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'choose' | 'otp-verify' | 'accepting'>('choose');

	async function signInWithGoogle() {
		error = '';
		loading = true;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=/buyer-invite/${invitation.token}/accept`
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
			email: invitation.email,
			options: { shouldCreateUser: true }
		});
		loading = false;
		if (err) {
			error = err.message;
		} else {
			mode = 'otp-verify';
		}
	}

	async function verifyAndAccept() {
		error = '';
		loading = true;

		const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
			email: invitation.email,
			token: otpCode,
			type: 'email'
		});

		if (verifyError) {
			error = verifyError.message;
			loading = false;
			return;
		}

		if (!authData.user) {
			error = 'Failed to verify account';
			loading = false;
			return;
		}

		mode = 'accepting';

		// Update display name
		if (displayName.trim()) {
			await supabase
				.from('profiles')
				.update({ display_name: displayName.trim() })
				.eq('id', authData.user.id);
		}

		// Accept buyer invitation
		const res = await fetch('/api/buyer-invite/accept', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				token: invitation.token,
				userId: authData.user.id
			})
		});

		if (!res.ok) {
			const body = await res.json();
			error = body.error || 'Failed to accept invitation';
			loading = false;
			mode = 'otp-verify';
			return;
		}

		loading = false;
		window.location.href = '/dashboard';
	}

	function reset() {
		mode = 'choose';
		otpCode = '';
		error = '';
	}
</script>

<Card class="border-0 shadow-none">
	<CardHeader>
		<CardTitle>Buyer Portal Invitation</CardTitle>
		<CardDescription>
			You've been invited to access <strong>{invitation.accountName}</strong> on {invitation.orgName}'s buyer portal.
		</CardDescription>
	</CardHeader>
	<CardContent>
		{#if error}
			<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{/if}

		{#if mode === 'choose'}
			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" value={invitation.email} disabled />
				</div>
				<div class="space-y-2">
					<Label for="display-name">Your name</Label>
					<Input id="display-name" placeholder="Jane Smith" bind:value={displayName} />
				</div>

				<div class="flex flex-col gap-3">
					<Button size="lg" onclick={signInWithGoogle} disabled={loading} class="w-full">
						Continue with Google
					</Button>

					<div class="relative my-1">
						<div class="absolute inset-0 flex items-center">
							<span class="w-full border-t"></span>
						</div>
						<div class="relative flex justify-center text-xs uppercase">
							<span class="bg-background px-2 text-muted-foreground">or</span>
						</div>
					</div>

					<Button size="lg" variant="outline" onclick={sendOtp} disabled={loading} class="w-full">
						{loading ? 'Sending code...' : 'Continue with Email'}
					</Button>
				</div>
			</div>
		{:else if mode === 'otp-verify'}
			<form onsubmit={(e) => { e.preventDefault(); verifyAndAccept(); }} class="space-y-4">
				<p class="text-sm text-muted-foreground">Enter the code sent to {invitation.email}</p>
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
					{loading ? 'Joining...' : 'Verify & Join'}
				</Button>
				<div class="flex justify-center gap-4 text-sm">
					<button type="button" class="text-muted-foreground hover:text-foreground" onclick={sendOtp}>
						Resend code
					</button>
					<button type="button" class="text-muted-foreground hover:text-foreground" onclick={reset}>
						Back
					</button>
				</div>
			</form>
		{:else if mode === 'accepting'}
			<div class="flex items-center justify-center py-8">
				<p class="text-sm text-muted-foreground">Setting up your account...</p>
			</div>
		{/if}
	</CardContent>
</Card>
