<script lang="ts">
	import { inView } from 'motion';

	let cmdEl = $state<HTMLElement | null>(null);
	let typedEl = $state<HTMLElement | null>(null);
	let ghostEl = $state<HTMLElement | null>(null);
	let resultsEl = $state<HTMLElement | null>(null);
	let running = false;

	const icons = {
		order:
			'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
		account: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12',
		plus: 'M12 4v16m8-8H4',
		sparkle:
			'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
		nav: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
		user: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0',
		brand:
			'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z'
	};

	function icon(path: string, cls = '') {
		return `<svg class="ci ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
	}

	function row(iconPath: string, label: string, right = '', hl = false, cls = '') {
		return `<div class="cmd-row${hl ? ' hl' : ''}"><div class="cmd-row-left">${icon(iconPath, cls)}<span class="${cls === 'ci-action' ? 'cmd-action-label' : 'cmd-label'}">${label}</span></div>${right ? `<div class="cmd-row-right">${right}</div>` : ''}</div>`;
	}

	function kbd(k: string) {
		return `<kbd class="cmd-kbd">${k}</kbd>`;
	}
	function group(title: string, rows: string) {
		return `<div class="cmd-group"><div class="cmd-group-title">${title}</div>${rows}</div>`;
	}

	const defaultHTML =
		group(
			'Orders',
			row(icons.order, 'Most recent orders', '') +
				row(icons.order, 'Confirmed Orders') +
				row(icons.order, 'Needs attention')
		) +
		group(
			'Create',
			row(icons.plus, 'New order', kbd('⌘') + kbd('O')) +
				row(icons.plus, 'New account', kbd('⌘') + kbd('A')) +
				row(icons.plus, 'New appointment', kbd('Shift') + kbd('⌘') + kbd('A'))
		) +
		group(
			'Navigate',
			row(icons.nav, 'Go to Orders', kbd('O')) +
				row(icons.account, 'Go to Accounts', kbd('A')) +
				row(icons.nav, 'Go to Reports', kbd('R'))
		);

	const loulouHTML =
		group(
			'Contacts',
			row(
				icons.user,
				'Lou Bell<span class="cmd-sub">lou@louloubell.com</span>',
				'<span class="cmd-go">Email</span> <span class="cmd-go">Go to account</span>'
			)
		) +
		group(
			'Accounts',
			row(
				icons.account,
				'LouLou Bell<span class="cmd-sub">NuBrand</span>',
				'<span class="cmd-go">Go to account</span>'
			)
		) +
		group(
			'Orders',
			row(
				icons.order,
				'NU-080987<span class="cmd-sub">LouLou Bell · Confirmed</span>',
				'<span class="cmd-season">Fall 2026</span>'
			) +
				row(
					icons.order,
					'NU-080845<span class="cmd-sub">LouLou Bell · Shipped</span>',
					'<span class="cmd-season">Fall 2026</span>'
				) +
				row(icons.order, 'NU-079221<span class="cmd-sub">LouLou Bell · Invoiced</span>')
		) +
		group(
			'Actions',
			row(
				icons.plus,
				'Create order for LouLou Bell, Fall 2026',
				'<span class="cmd-badge">AI</span>',
				false,
				'ci-action'
			) +
				row(
					icons.sparkle,
					'Ask AI about loulou',
					'<span class="cmd-badge">AI</span>',
					false,
					'ci-action'
				)
		);

	const nubrandHTML =
		group(
			'Brands',
			row(
				icons.brand,
				'NuBrand<span class="cmd-sub">New York, NY</span>',
				'<span class="cmd-go">Go to brand</span>'
			)
		) +
		group(
			'Orders',
			row(
				icons.order,
				'NU-080987<span class="cmd-sub">LouLou Bell · Confirmed</span>',
				'<span class="cmd-season">Fall 2026</span>'
			) +
				row(
					icons.order,
					'NU-081002<span class="cmd-sub">Bergman\'s · Pending</span>',
					'<span class="cmd-season">Fall 2026</span>'
				) +
				row(icons.order, 'NU-080910<span class="cmd-sub">The Edit · Shipped</span>')
		) +
		group(
			'Actions',
			row(
				icons.sparkle,
				'Ask AI about nubrand',
				'<span class="cmd-badge">AI</span>',
				false,
				'ci-action'
			)
		);

	function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	async function typeText(text: string, delayMs: number) {
		if (!typedEl || !ghostEl) return;
		for (let i = 0; i < text.length; i++) {
			typedEl.textContent += text[i];
			ghostEl.textContent = '';
			await sleep(delayMs);
		}
	}

	async function clearText(delayMs: number) {
		if (!typedEl || !ghostEl) return;
		const t = typedEl.textContent ?? '';
		for (let i = t.length; i > 0; i--) {
			typedEl.textContent = t.slice(0, i - 1);
			if (!typedEl.textContent) ghostEl.textContent = 'Search or type a command...';
			await sleep(delayMs);
		}
	}

	async function play() {
		if (running || !typedEl || !ghostEl || !resultsEl) return;
		running = true;

		typedEl.textContent = '';
		ghostEl.textContent = 'Search or type a command...';
		resultsEl.innerHTML = defaultHTML;
		await sleep(2000);

		await typeText('loulou', 100);
		await sleep(400);
		resultsEl.innerHTML = loulouHTML;
		await sleep(3000);

		await clearText(40);
		await sleep(200);
		resultsEl.innerHTML = defaultHTML;
		await sleep(1500);

		await typeText('nubrand', 100);
		await sleep(400);
		resultsEl.innerHTML = nubrandHTML;
		await sleep(3000);

		await clearText(40);
		await sleep(200);
		resultsEl.innerHTML = defaultHTML;
		await sleep(1500);

		running = false;
		play();
	}

	$effect(() => {
		if (!cmdEl) return;
		const stop = inView(
			cmdEl,
			() => {
				play();
			},
			{ amount: 0.3 }
		);
		return stop;
	});
</script>

<div class="flex justify-center px-5 pt-4">
	<div
		bind:this={cmdEl}
		class="cmd flex h-[420px] w-full max-w-[480px] flex-col overflow-hidden border-t border-r border-l border-neutral-300 bg-[#f5f5f5]"
	>
		<div class="flex shrink-0 items-center justify-between px-4 py-3.5">
			<div>
				<span class="cmd-typed" bind:this={typedEl}></span><span class="cmd-cursor"></span><span
					class="cmd-ghost"
					bind:this={ghostEl}>Search or type a command...</span
				>
			</div>
			<span class="shrink-0 text-[11px] text-neutral-400">esc to close</span>
		</div>
		<div class="cmd-results flex-1 overflow-hidden px-4" bind:this={resultsEl}></div>
		<div class="flex shrink-0 items-center gap-3 px-4 py-3">
			<div class="flex items-center gap-1 text-[11px] text-neutral-400">
				<span class="kbd">↑↓</span><span>navigate</span>
			</div>
			<div class="flex items-center gap-1 text-[11px] text-neutral-400">
				<span class="kbd">↵</span><span>select</span>
			</div>
			<div class="flex items-center gap-1 text-[11px] text-neutral-400">
				<span class="kbd">tab</span><span>to ask Stitch</span>
			</div>
		</div>
	</div>
</div>

<style>
	.cmd-typed {
		font-size: 14px;
		color: #1a1a1a;
	}
	.cmd-cursor {
		display: inline-block;
		width: 1px;
		height: 15px;
		background: #1a1a1a;
		vertical-align: text-bottom;
		animation: blink 1s step-end infinite;
	}
	.cmd-ghost {
		font-size: 14px;
		color: #a0a0a0;
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	:global(.cmd-group) {
		padding-top: 10px;
	}
	:global(.cmd-group:first-child) {
		padding-top: 0;
	}
	:global(.cmd-group-title) {
		font-size: 10px;
		font-weight: 700;
		color: #888;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin-bottom: 4px;
	}
	:global(.cmd-row) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		border-radius: 6px;
	}
	:global(.cmd-row.hl) {
	}
	:global(.cmd-row-left) {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	:global(.cmd-row-right) {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	:global(.ci) {
		width: 16px;
		height: 16px;
		color: #888;
		flex-shrink: 0;
	}
	:global(.ci-action) {
		color: #7c3aed;
	}
	:global(.cmd-label) {
		font-size: 13px;
		font-weight: 500;
		color: #1a1a1a;
	}
	:global(.cmd-sub) {
		font-size: 11px;
		color: #888;
		margin-left: 6px;
	}
	:global(.cmd-action-label) {
		font-size: 13px;
		font-weight: 500;
		color: #7c3aed;
	}
	:global(.cmd-badge) {
		font-size: 10px;
		color: #888;
		background: #e0e0e0;
		padding: 1px 5px;
		border-radius: 3px;
	}
	:global(.cmd-go) {
		font-size: 10px;
		color: #aaa;
	}
	:global(.cmd-season) {
		font-size: 10px;
		font-weight: 500;
		padding: 1px 6px;
		border-radius: 3px;
		background: #d1fae5;
		color: #065f46;
	}

	.kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 1px 5px;
		background: #e5e5e5;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		font-size: 10px;
		color: #888;
	}

	:global(.cmd-kbd) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 1px 5px;
		background: #e5e5e5;
		border-radius: 4px;
		font-family: ui-monospace, monospace;
		font-size: 10px;
		color: #888;
	}
</style>
