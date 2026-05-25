<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { supabase } from '$lib/supabase.js';

	type Props = {
		open: boolean;
		ontoggle: () => void;
		toEmail?: string;
		relatedType?: string;
		relatedId?: string;
		organizationId?: string;
	};

	type AttachmentItem = {
		name: string;
		mimeType: string;
		source: 'local' | 'resource';
		file?: File;
		base64?: string;
	};

	type BrandOption = { id: string; name: string };
	type AssetOption = {
		id: string;
		name: string;
		mime_type: string | null;
		file_path: string;
		category: string;
		file_size: number | null;
	};

	let { open, ontoggle, toEmail = '', relatedType, relatedId, organizationId }: Props = $props();

	let toEmails = $state<string[]>([]);
	let toInput = $state('');
	let toDropdownOpen = $state(false);
	let contacts = $state<{ email: string; name: string }[]>([]);
	let contactsLoaded = $state(false);

	let subject = $state('');
	let body = $state('');
	let sending = $state(false);
	let error = $state('');
	let attachments = $state<AttachmentItem[]>([]);
	let attachInput: HTMLInputElement | undefined = $state();

	const filteredContacts = $derived(
		toInput.trim().length > 0
			? contacts
					.filter(
						(c) =>
							(c.email.toLowerCase().includes(toInput.toLowerCase()) ||
								c.name.toLowerCase().includes(toInput.toLowerCase())) &&
							!toEmails.includes(c.email)
					)
					.slice(0, 8)
			: []
	);

	async function loadContacts() {
		if (contactsLoaded) return;
		try {
			const res = await fetch('/api/email/contacts');
			if (res.ok) {
				const data = await res.json();
				contacts = data.contacts ?? [];
			}
		} catch {
			/* silent */
		}
		contactsLoaded = true;
	}

	function addEmail(email: string) {
		const trimmed = email.trim().toLowerCase();
		if (trimmed && !toEmails.includes(trimmed)) {
			toEmails = [...toEmails, trimmed];
		}
		toInput = '';
		toDropdownOpen = false;
	}

	function removeEmail(email: string) {
		toEmails = toEmails.filter((e) => e !== email);
	}

	function handleToKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && toInput.trim()) {
			e.preventDefault();
			addEmail(toInput);
		}
		if (e.key === 'Backspace' && !toInput && toEmails.length > 0) {
			toEmails = toEmails.slice(0, -1);
		}
		if (e.key === 'Escape') {
			toDropdownOpen = false;
		}
	}

	// Template picker state
	type EmailTemplate = {
		id: string;
		name: string;
		subject: string;
		body: string;
		category: string;
	};
	let templates = $state<EmailTemplate[]>([]);
	let templatesLoaded = $state(false);
	let showTemplatePicker = $state(false);
	let showSaveTemplate = $state(false);
	let templateName = $state('');
	let savingTemplate = $state(false);

	async function loadTemplates() {
		if (templatesLoaded) return;
		const { data } = await supabase.from('email_templates').select('*').order('name');
		templates = (data ?? []) as EmailTemplate[];
		templatesLoaded = true;
	}

	function applyTemplate(t: EmailTemplate) {
		subject = t.subject;
		body = t.body;
		showTemplatePicker = false;
	}

	async function saveAsTemplate() {
		if (!templateName.trim() || !subject.trim()) return;
		savingTemplate = true;
		const { data: userData } = await supabase.auth.getUser();
		await supabase.from('email_templates').insert({
			organization_id: organizationId ?? userData.user?.app_metadata?.organization_id,
			name: templateName.trim(),
			subject: subject.trim(),
			body: body.trim(),
			created_by: userData.user?.id
		});
		templateName = '';
		showSaveTemplate = false;
		savingTemplate = false;
		templatesLoaded = false;
		loadTemplates();
	}

	// Resource picker state
	let showResourcePicker = $state(false);
	let resourceBrands = $state<BrandOption[]>([]);
	let selectedBrandId = $state('');
	let brandAssets = $state<AssetOption[]>([]);
	let loadingAssets = $state(false);

	// AI writer state
	let showAiWriter = $state(false);
	let aiPrompt = $state('');
	let aiWriting = $state(false);

	$effect(() => {
		if (open) {
			toEmails = toEmail ? [toEmail] : [];
			toInput = '';
			subject = '';
			body = '';
			error = '';
			attachments = [];
			showResourcePicker = false;
			showAiWriter = false;
			aiPrompt = '';
			showTemplatePicker = false;
			showSaveTemplate = false;
			loadContacts();
			loadTemplates();
		}
	});

	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(',')[1] ?? '');
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function handleAttachFiles() {
		const files = attachInput?.files;
		if (!files) return;
		for (let i = 0; i < files.length; i++) {
			attachments = [
				...attachments,
				{
					name: files[i].name,
					mimeType: files[i].type || 'application/octet-stream',
					source: 'local',
					file: files[i]
				}
			];
		}
		if (attachInput) attachInput.value = '';
	}

	function removeAttachment(index: number) {
		attachments = attachments.filter((_, i) => i !== index);
	}

	// Resource picker
	async function openResourcePicker() {
		showResourcePicker = true;
		if (resourceBrands.length === 0) {
			const res = await fetch('/api/brands');
			if (res.ok) {
				const data = await res.json();
				resourceBrands = data.brands ?? [];
			}
		}
	}

	async function loadBrandAssets(brandId: string) {
		selectedBrandId = brandId;
		loadingAssets = true;
		const res = await fetch(`/api/brands/${brandId}/assets`);
		if (res.ok) {
			const data = await res.json();
			brandAssets = Array.isArray(data) ? data : (data.assets ?? []);
		}
		loadingAssets = false;
	}

	async function attachResource(asset: AssetOption) {
		try {
			const { data: signedData } = await supabase.storage
				.from('brand-assets')
				.createSignedUrl(asset.file_path, 120);

			if (!signedData?.signedUrl) {
				// Fallback: try downloading directly
				const { data: blobData } = await supabase.storage
					.from('brand-assets')
					.download(asset.file_path);

				if (blobData) {
					const buffer = await blobData.arrayBuffer();
					const bytes = new Uint8Array(buffer);
					let binary = '';
					for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
					const base64 = btoa(binary);

					attachments = [
						...attachments,
						{
							name: asset.name,
							mimeType: asset.mime_type ?? 'application/octet-stream',
							source: 'resource',
							base64
						}
					];
				}
			} else {
				const res = await fetch(signedData.signedUrl);
				const blob = await res.blob();
				const buffer = await blob.arrayBuffer();
				const bytes = new Uint8Array(buffer);
				let binary = '';
				for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
				const base64 = btoa(binary);

				attachments = [
					...attachments,
					{
						name: asset.name,
						mimeType: asset.mime_type ?? 'application/octet-stream',
						source: 'resource',
						base64
					}
				];
			}
		} catch (err) {
			console.error('Failed to attach resource:', err);
		}
		showResourcePicker = false;
	}

	// AI writer
	async function handleAiWrite() {
		if (!aiPrompt.trim()) return;
		aiWriting = true;

		try {
			const message = `Draft a professional email body. ${toEmails.length ? `To: ${toEmails.join(', ')}.` : ''} ${subject ? `Subject: ${subject}.` : ''} Intent: ${aiPrompt.trim()}. ${body ? `Existing draft to refine: "${body}"` : ''} Write only the email body text, no subject line, no greeting salutation unless natural. Keep it concise and professional.`;

			const res = await fetch('/api/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message, conversationHistory: [] })
			});

			if (res.ok) {
				const data = await res.json();
				body = data.response ?? body;
			}
		} catch {
			// silent
		} finally {
			aiWriting = false;
			showAiWriter = false;
			aiPrompt = '';
		}
	}

	async function handleSend() {
		// Add any pending input as an email
		if (toInput.trim()) addEmail(toInput);

		if (toEmails.length === 0 || !subject.trim() || !body.trim()) {
			error = 'Please fill in all fields.';
			return;
		}

		sending = true;
		error = '';

		try {
			const payload: Record<string, unknown> = {
				to: toEmails.join(', '),
				subject: subject.trim(),
				body: body.trim()
			};

			if (relatedType) payload.relatedType = relatedType;
			if (relatedId) payload.relatedId = relatedId;

			if (attachments.length > 0) {
				payload.attachments = await Promise.all(
					attachments.map(async (att) => ({
						filename: att.name,
						mimeType: att.mimeType,
						content: att.file ? await fileToBase64(att.file) : (att.base64 ?? '')
					}))
				);
			}

			const res = await fetch('/api/email/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (res.ok) {
				ontoggle();
			} else {
				const json = await res.json().catch(() => ({}));
				error = json.message ?? 'Failed to send email.';
			}
		} catch {
			error = 'Failed to send email.';
		} finally {
			sending = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open && !sending) {
			ontoggle();
		}
	}

	const categoryColors: Record<string, string> = {
		lookbook: 'bg-blue-100 text-blue-700',
		linesheet: 'bg-indigo-100 text-indigo-700',
		order_form_template: 'bg-amber-100 text-amber-700',
		marketing: 'bg-emerald-100 text-emerald-700',
		other: 'bg-zinc-100 text-zinc-600'
	};
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
		onclick={() => !sending && ontoggle()}
	></div>

	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-2xl overflow-hidden rounded-none border bg-card shadow-xl"
			onclick={(e: MouseEvent) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4">
				<div class="flex items-center gap-2">
					<h2 class="text-base font-semibold">New Message</h2>
					<div class="relative">
						<button
							type="button"
							class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={() => (showTemplatePicker = !showTemplatePicker)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3.5 w-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
								/>
							</svg>
							Templates
						</button>
						{#if showTemplatePicker}
							<div
								class="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border bg-card shadow-lg"
							>
								{#if templates.length === 0}
									<p class="px-4 py-3 text-sm text-muted-foreground">No templates yet</p>
								{:else}
									<div class="max-h-48 overflow-y-auto py-1">
										{#each templates as t (t.id)}
											<button
												type="button"
												class="flex w-full flex-col px-4 py-2 text-left transition-colors hover:bg-muted/50"
												onclick={() => applyTemplate(t)}
											>
												<span class="text-sm font-medium">{t.name}</span>
												<span class="truncate text-sm text-muted-foreground">{t.subject}</span>
											</button>
										{/each}
									</div>
								{/if}
								<div class="border-t px-4 py-2">
									{#if showSaveTemplate}
										<div class="flex items-center gap-2">
											<input
												type="text"
												bind:value={templateName}
												placeholder="Template name"
												class="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none"
												onkeydown={(e) => {
													if (e.key === 'Enter') saveAsTemplate();
												}}
											/>
											<button
												type="button"
												class="rounded-md bg-primary px-2 py-1 text-sm font-medium text-primary-foreground"
												onclick={saveAsTemplate}
												disabled={savingTemplate || !templateName.trim()}
											>
												Save
											</button>
										</div>
									{:else}
										<button
											type="button"
											class="text-sm text-muted-foreground hover:text-foreground"
											onclick={() => (showSaveTemplate = true)}
										>
											Save current as template
										</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
				<button
					class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={ontoggle}
					disabled={sending}
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Form -->
			<div class="space-y-4 px-5 pb-2">
				<div class="space-y-2">
					<Label>To</Label>
					<div class="relative">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2"
							onclick={(e) => {
								if (!(e.target as HTMLElement).closest('button'))
									(document.getElementById('compose-to-input') as HTMLElement)?.focus();
							}}
						>
							{#each toEmails as email (email)}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm"
								>
									{email}
									<button
										type="button"
										aria-label="Remove {email}"
										class="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
										onclick={() => removeEmail(email)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</span>
							{/each}
							<input
								id="compose-to-input"
								type="text"
								bind:value={toInput}
								onkeydown={handleToKeydown}
								onfocus={() => (toDropdownOpen = true)}
								oninput={() => (toDropdownOpen = true)}
								onblur={() => {
									setTimeout(() => (toDropdownOpen = false), 200);
								}}
								placeholder={toEmails.length === 0 ? 'Type a name or email...' : ''}
								class="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
							/>
						</div>
						{#if toDropdownOpen && filteredContacts.length > 0}
							<div
								class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-none border bg-card shadow-lg"
							>
								{#each filteredContacts as contact (contact.email)}
									<button
										type="button"
										class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
										onmousedown={(e) => {
											e.preventDefault();
											addEmail(contact.email);
										}}
									>
										<div class="min-w-0 flex-1">
											{#if contact.name}
												<p class="truncate text-sm font-medium">{contact.name}</p>
												<p class="truncate text-xs text-muted-foreground">{contact.email}</p>
											{:else}
												<p class="text-sm">{contact.email}</p>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="space-y-2">
					<Label for="compose-subject">Subject</Label>
					<Input id="compose-subject" bind:value={subject} placeholder="Email subject" />
				</div>
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="compose-body">Message</Label>
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={() => (showAiWriter = !showAiWriter)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3.5 w-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
								/>
							</svg>
							Help me write
						</button>
					</div>

					{#if showAiWriter}
						<div class="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2">
							<input
								type="text"
								bind:value={aiPrompt}
								placeholder="What do you want to say? e.g., follow up on Fall order"
								class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleAiWrite();
									}
								}}
								disabled={aiWriting}
							/>
							<button
								type="button"
								class="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
								onclick={handleAiWrite}
								disabled={aiWriting || !aiPrompt.trim()}
							>
								{aiWriting ? 'Writing...' : 'Generate'}
							</button>
						</div>
					{/if}

					<textarea
						id="compose-body"
						bind:value={body}
						placeholder="Write your message..."
						rows="6"
						class="flex w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
					></textarea>
				</div>

				<!-- Attachments -->
				<div class="space-y-2">
					<input
						type="file"
						multiple
						bind:this={attachInput}
						onchange={handleAttachFiles}
						class="hidden"
					/>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={() => attachInput?.click()}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
								/>
							</svg>
							Attach file
						</button>
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={openResourcePicker}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
								/>
							</svg>
							Attach resource
						</button>
					</div>

					<!-- Resource picker -->
					{#if showResourcePicker}
						<div class="space-y-2 rounded-lg border bg-muted/20 p-3">
							<select
								class="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
								value={selectedBrandId}
								onchange={(e) => loadBrandAssets((e.target as HTMLSelectElement).value)}
							>
								<option value="">Select a brand...</option>
								{#each resourceBrands as brand (brand.id)}
									<option value={brand.id}>{brand.name}</option>
								{/each}
							</select>
							{#if loadingAssets}
								<p class="text-sm text-muted-foreground">Loading assets...</p>
							{:else if selectedBrandId && brandAssets.length === 0}
								<p class="text-sm text-muted-foreground">No resources for this brand.</p>
							{:else if brandAssets.length > 0}
								<div class="max-h-40 space-y-1 overflow-y-auto">
									{#each brandAssets as asset (asset.id)}
										<button
											type="button"
											class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
											onclick={() => attachResource(asset)}
										>
											<span class="flex-1 truncate font-medium">{asset.name}</span>
											<span
												class="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium {categoryColors[
													asset.category.toLowerCase()
												] ?? categoryColors.other}"
											>
												{asset.category}
											</span>
										</button>
									{/each}
								</div>
							{/if}
							<button
								type="button"
								class="text-xs text-muted-foreground hover:text-foreground"
								onclick={() => (showResourcePicker = false)}
							>
								Cancel
							</button>
						</div>
					{/if}

					<!-- Attached items -->
					{#if attachments.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each attachments as att, i (i)}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm"
								>
									{#if att.source === 'resource'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3 text-muted-foreground"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
											/>
										</svg>
									{/if}
									{att.name}
									<button
										type="button"
										class="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
										onclick={() => removeAttachment(i)}
										aria-label="Remove {att.name}"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</span>
							{/each}
						</div>
					{/if}
				</div>

				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end gap-3 px-5 py-4">
				<Button variant="outline" onclick={ontoggle} disabled={sending}>Cancel</Button>
				<Button onclick={handleSend} loading={sending}>Send</Button>
			</div>
		</div>
	</div>
{/if}
