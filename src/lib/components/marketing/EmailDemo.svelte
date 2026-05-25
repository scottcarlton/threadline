<script lang="ts">
	/* eslint-disable svelte/no-dom-manipulating */
	import { inView } from 'motion';

	let wrapEl = $state<HTMLElement | null>(null);
	let textEl = $state<HTMLElement | null>(null);
	let running = false;

	const replyText =
		'Create an order for Tarmigien for the NuBrand daria silk blouse with 1xs, 2s, 3m, 2l, 1xl for a 9-15 9-30 delivery';

	function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	async function play() {
		if (running || !textEl) return;
		running = true;
		textEl.textContent = '';
		await sleep(800);
		for (let i = 0; i < replyText.length; i++) {
			textEl.textContent += replyText[i];
			await sleep(30);
		}
		running = false;
	}

	$effect(() => {
		if (!wrapEl) return;
		const stop = inView(
			wrapEl,
			() => {
				play();
			},
			{ amount: 0.3 }
		);
		return stop;
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
	/>
</svelte:head>

<div class="flex justify-center px-5 pt-4">
	<div bind:this={wrapEl} class="gmail h-[400px] max-w-[520px]">
		<!-- Top bar -->
		<div class="g-topbar">
			<span class="mi mi-20">menu</span>
			<div class="g-search">
				<span class="mi mi-16">search</span>
				<span class="g-search-text">Search mail</span>
				<span class="mi mi-14">arrow_drop_down</span>
			</div>
			<div class="g-topbar-right">
				<span class="mi mi-18">help_outline</span>
				<span class="mi mi-18">settings</span>
				<span class="mi mi-18">apps</span>
				<div class="g-avatar-sm"></div>
			</div>
		</div>

		<!-- Toolbar -->
		<div class="g-toolbar">
			<div class="g-toolbar-left">
				<span class="mi mi-16">arrow_back</span>
				<span class="mi mi-16">archive</span>
				<span class="mi mi-16">report</span>
				<span class="mi mi-16">delete</span>
				<div class="g-sep"></div>
				<span class="mi mi-16">mark_email_read</span>
				<span class="mi mi-16">schedule</span>
				<span class="mi mi-16">label</span>
				<div class="g-sep"></div>
				<span class="mi mi-16">drive_file_move</span>
				<span class="mi mi-16">shortcut</span>
				<span class="mi mi-16">more_vert</span>
			</div>
			<div class="g-toolbar-right">
				<span class="g-pager">4 of 4,751</span>
				<span class="mi mi-14">chevron_left</span>
				<span class="mi mi-14">chevron_right</span>
			</div>
		</div>

		<!-- Subject -->
		<div class="g-subject">
			<span class="g-subject-text">NuBrand Order</span>
			<div class="g-subject-icons">
				<span class="mi mi-16">print</span>
				<span class="mi mi-16">open_in_new</span>
			</div>
		</div>

		<!-- Sender -->
		<div class="g-sender">
			<div class="g-avatar"></div>
			<div class="g-sender-info">
				<div class="g-sender-name-row">
					<span class="g-sender-name">Mary Tarmigien</span>
					<span class="g-sender-email">&lt;mary.tarmigien@bloom.com&gt;</span>
				</div>
				<div class="g-sender-to">to me ▾</div>
			</div>
			<div class="g-sender-meta">
				<span class="g-time">8:05 PM (3 minutes ago)</span>
				<span class="mi mi-16">star_outline</span>
				<span class="mi mi-16">sentiment_satisfied</span>
				<span class="mi mi-16">reply</span>
				<span class="mi mi-16">more_vert</span>
			</div>
		</div>

		<!-- Body -->
		<div class="g-body">
			Denise, thanks for reaching out. Yes I'd like to order the daria silk blouse with 1xs, 2s, 3m,
			2l, 1xl for a 9-15 delivery
		</div>

		<!-- Reply -->
		<div class="g-reply">
			<div class="g-reply-header">
				<div class="g-avatar-reply"></div>
				<span class="mi mi-14">reply</span>
				<span class="g-reply-dropdown">▾</span>
				<span class="g-reply-to"
					>To <strong>Stitch</strong> &lt;stitch@orders.threadline.systems&gt;</span
				>
			</div>
			<div class="g-reply-body" bind:this={textEl}></div>
			<div class="g-sendbar">
				<div class="g-sendbar-left">
					<button class="g-send-btn">Send <span class="g-send-arrow">▾</span></button>
					<span class="mi mi-16">text_format</span>
					<span class="mi mi-16">attach_file</span>
					<span class="mi mi-16">draw</span>
					<span class="mi mi-16">link</span>
					<span class="mi mi-16">cloud_upload</span>
					<span class="mi mi-16">sentiment_satisfied</span>
					<span class="mi mi-16">image</span>
					<span class="mi mi-16">lock</span>
					<span class="mi mi-16">edit</span>
					<span class="mi mi-16">grid_view</span>
					<span class="mi mi-16">snippet_folder</span>
					<span class="mi mi-16">more_horiz</span>
				</div>
				<span class="mi mi-16">delete</span>
			</div>
		</div>

		<!-- Spacer -->
		<div class="g-spacer"></div>
	</div>
</div>

<style>
	.mi {
		font-family: 'Material Symbols Outlined';
		font-weight: normal;
		font-style: normal;
		display: inline-block;
		line-height: 1;
		text-transform: none;
		letter-spacing: normal;
		word-wrap: normal;
		white-space: nowrap;
		direction: ltr;
		-webkit-font-smoothing: antialiased;
		color: #5f6368;
	}
	.mi-14 {
		font-size: 14px;
	}
	.mi-16 {
		font-size: 16px;
	}
	.mi-18 {
		font-size: 18px;
	}
	.mi-20 {
		font-size: 20px;
	}

	.gmail {
		width: 100%;
		background: #fff;
		border-radius: 0;
		overflow: hidden;
		font-family:
			'Google Sans',
			Roboto,
			-apple-system,
			sans-serif;
		font-size: 12px;
		color: #5f6368;
		border: 1px solid #dadce0;
		border-bottom: none;
	}

	.g-topbar {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		align-items: center;
		padding: 6px 10px;
		gap: 8px;
	}

	.g-search {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		background: #f1f3f4;
		border-radius: 8px;
		padding: 5px 10px;
		width: 100%;
	}
	.g-search-text {
		font-size: 12px;
		color: #5f6368;
		flex: 1;
	}

	.g-topbar-right {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-self: end;
	}

	.g-avatar-sm {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #a0a0a0;
	}

	.g-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 2px 10px;
	}

	.g-toolbar-left {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.g-sep {
		width: 1px;
		height: 16px;
		background: #dadce0;
		margin: 0 4px;
	}

	.g-toolbar-right {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.g-pager {
		font-size: 10px;
		color: #5f6368;
	}

	.g-subject {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px 4px;
	}
	.g-subject-text {
		font-size: 16px;
		color: #202124;
	}
	.g-subject-icons {
		display: flex;
		gap: 6px;
	}

	.g-sender {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 14px;
	}

	.g-avatar {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: #a0a0a0;
		flex-shrink: 0;
	}

	.g-sender-info {
		flex: 1;
		min-width: 0;
	}
	.g-sender-name-row {
		display: flex;
		align-items: baseline;
		gap: 4px;
	}
	.g-sender-name {
		font-size: 12px;
		font-weight: 700;
		color: #202124;
	}
	.g-sender-email {
		font-size: 10px;
		color: #5f6368;
	}
	.g-sender-to {
		font-size: 10px;
		color: #5f6368;
	}

	.g-sender-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.g-time {
		font-size: 9px;
		color: #5f6368;
		white-space: nowrap;
	}

	.g-body {
		font-size: 12px;
		line-height: 1.6;
		color: #3c4043;
		padding: 6px 14px 14px 48px;
	}

	.g-reply {
		margin-left: 48px;
		margin-right: 14px;
		padding-top: 10px;
	}

	.g-reply-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
	}

	.g-avatar-reply {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #a0a0a0;
		flex-shrink: 0;
	}

	.g-reply-dropdown {
		font-size: 9px;
		color: #5f6368;
	}
	.g-reply-to {
		font-size: 10px;
		color: #5f6368;
	}
	.g-reply-to strong {
		font-weight: 700;
		color: #3c4043;
	}

	.g-reply-body {
		font-size: 12px;
		line-height: 1.6;
		color: #3c4043;
		min-height: 1.6em;
		padding-bottom: 8px;
	}

	.g-sendbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 0 10px;
	}

	.g-sendbar-left {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.g-send-btn {
		display: inline-flex;
		align-items: center;
		background: #1a73e8;
		color: #fff;
		border: none;
		border-radius: 16px;
		padding: 4px 10px;
		font-size: 12px;
		font-weight: 500;
		gap: 4px;
		margin-right: 6px;
		cursor: default;
	}
	.g-send-arrow {
		font-size: 10px;
	}

	.g-spacer {
		height: 80px;
	}
</style>
