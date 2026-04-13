<script lang="ts">
	import { marked } from 'marked';

	type Props = {
		content: string;
	};

	let { content }: Props = $props();

	// Configure marked for chat context
	marked.setOptions({
		breaks: true,
		gfm: true
	});

	const html = $derived(marked.parse(content, { async: false }) as string);
</script>

<div class="markdown">
	{@html html}
</div>

<style>
	.markdown {
		font-size: inherit;
		line-height: 1.625;
	}

	.markdown :global(p) {
		margin-bottom: 0.5em;
	}
	.markdown :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown :global(strong) {
		font-weight: 600;
		color: inherit;
	}

	.markdown :global(em) {
		font-style: italic;
	}

	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3) {
		font-weight: 600;
		margin-top: 0.75em;
		margin-bottom: 0.25em;
		line-height: 1.3;
	}
	.markdown :global(h1) {
		font-size: 1.1em;
	}
	.markdown :global(h2) {
		font-size: 1em;
	}
	.markdown :global(h3) {
		font-size: 0.95em;
	}
	.markdown :global(h1:first-child),
	.markdown :global(h2:first-child),
	.markdown :global(h3:first-child) {
		margin-top: 0;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		margin: 0.4em 0;
		padding-left: 1.5em;
	}
	.markdown :global(ul) {
		list-style-type: disc;
	}
	.markdown :global(ol) {
		list-style-type: decimal;
	}
	.markdown :global(li) {
		margin-bottom: 0.15em;
	}
	.markdown :global(li > ul),
	.markdown :global(li > ol) {
		margin: 0.1em 0;
	}

	.markdown :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.85em;
		background: rgba(255, 255, 255, 0.08);
		padding: 0.15em 0.35em;
		border-radius: 0.25rem;
	}

	.markdown :global(pre) {
		margin: 0.5em 0;
		padding: 0.75em 1em;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 0.5rem;
		overflow-x: auto;
	}
	.markdown :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.8em;
	}

	.markdown :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0.5em 0;
		font-size: 0.85em;
	}
	.markdown :global(th),
	.markdown :global(td) {
		padding: 0.35em 0.6em;
		border: 1px solid rgba(255, 255, 255, 0.1);
		text-align: left;
	}
	.markdown :global(th) {
		font-weight: 600;
		background: rgba(255, 255, 255, 0.05);
	}

	.markdown :global(a) {
		color: rgb(167, 139, 250);
		text-decoration: none;
	}
	.markdown :global(a:hover) {
		text-decoration: underline;
	}

	.markdown :global(blockquote) {
		margin: 0.5em 0;
		padding-left: 0.75em;
		border-left: 3px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.7);
	}

	.markdown :global(hr) {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		margin: 0.75em 0;
	}
</style>
