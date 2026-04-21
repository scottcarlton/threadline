<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { brandTermsSchema } from '$lib/schemas/brand-terms.js';

	let { data } = $props();

	type Brand = { id: string; name: string };
	type CurrentRow = {
		id: string;
		brand_id: string;
		title: string;
		body: string;
		version: number;
		is_current: boolean;
		created_at: string | null;
		created_by: string | null;
	};
	type HistoryRow = {
		id: string;
		brand_id: string;
		version: number;
		title: string;
		created_at: string | null;
		is_current: boolean;
	};

	const brands = $derived(data.brands as Brand[]);
	const current = $derived(data.current as CurrentRow[]);
	const history = $derived(data.history as HistoryRow[]);

	let selectedBrandId = $state<string>('');
	$effect(() => {
		if (!selectedBrandId && brands.length > 0) selectedBrandId = brands[0].id;
	});

	const currentForBrand = $derived(current.find((c) => c.brand_id === selectedBrandId) ?? null);
	const historyForBrand = $derived(
		history
			.filter((h) => h.brand_id === selectedBrandId && !h.is_current)
			.sort((a, b) => b.version - a.version)
	);

	const brandItems = $derived(brands.map((b) => ({ value: b.id, label: b.name })));

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting, message } = superForm(data.form, {
		validators: zod4Client(brandTermsSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form: f }) => {
			if (f.valid && (f.message as { success?: boolean } | undefined)?.success === undefined) {
				// superForm message lives in data after redirect; we set success via returned result
			}
		},
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Terms saved. The new version is now current.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save terms');
			}
		}
	});

	// Prefill the form from the selected brand's current terms so the editor
	// opens with the existing body (author edits in place).
	$effect(() => {
		$form.brand_id = selectedBrandId;
		if (currentForBrand) {
			$form.title = currentForBrand.title;
			$form.body = currentForBrand.body;
		} else {
			$form.title = 'Terms & Conditions';
			$form.body = '';
		}
	});

	// Swallow unused-variable warning — `message` is reserved for future use.
	void message;
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Buyer terms</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Per-brand terms that reps present to buyers at order submit. Saving creates a new version
				and records it on every order that agrees.
			</p>
		</div>
	</div>

	{#if brands.length === 0}
		<div class="flex flex-col items-center pt-[20dvh] text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="0.4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">No active brands on file</p>
			<p class="mt-2 max-w-md text-sm text-muted-foreground">
				Add a brand to your organization before authoring buyer terms.
			</p>
		</div>
	{:else}
		<div class="space-y-2">
			<Label for="brand-select">Brand</Label>
			<SelectField
				value={selectedBrandId}
				items={brandItems}
				class="w-full max-w-sm"
				onValueChange={(v) => (selectedBrandId = v)}
			/>
		</div>

		<form method="POST" action="?/save" use:enhance class="space-y-5">
			<input type="hidden" name="brand_id" bind:value={$form.brand_id} />

			<div class="space-y-2">
				<Label for="terms-title">Title</Label>
				<Input
					id="terms-title"
					name="title"
					bind:value={$form.title}
					maxlength={120}
					aria-invalid={$errors.title ? 'true' : undefined}
				/>
				{#if $errors.title}
					<p class="text-sm text-destructive">{$errors.title[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="terms-body">Body</Label>
				<textarea
					id="terms-body"
					name="body"
					rows={14}
					maxlength={20000}
					class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					bind:value={$form.body}
					placeholder="Cancellations, returns, shipping, payment terms…"
					aria-invalid={$errors.body ? 'true' : undefined}
				></textarea>
				{#if $errors.body}
					<p class="text-sm text-destructive">{$errors.body[0]}</p>
				{/if}
			</div>

			<div class="flex items-center justify-between">
				<p class="text-sm text-muted-foreground">
					{#if currentForBrand}
						Current version: v{currentForBrand.version}. Saving creates v{currentForBrand.version +
							1} and marks prior versions as superseded.
					{:else}
						No terms on file. Saving creates v1.
					{/if}
				</p>
				<Button type="submit" disabled={$submitting}>
					{$submitting ? 'Saving…' : 'Save new version'}
				</Button>
			</div>
		</form>

		{#if historyForBrand.length > 0}
			<div class="rounded-lg border">
				<div class="border-b px-5 py-3 text-sm font-medium">Previous versions</div>
				<ul class="divide-y">
					{#each historyForBrand as h (h.id)}
						<li class="flex items-center justify-between px-5 py-3 text-sm">
							<span>
								v{h.version} · {h.title}
							</span>
							<span class="text-muted-foreground">
								{h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</div>
