<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogTitle,
		DialogDescription
	} from '$lib/components/ui/dialog/index.js';
	import { signOutRequest, syncPanelOpen } from '$lib/offline/sync-ui';

	const request = signOutRequest;
	const one = $derived($request?.count === 1);
	const items = $derived(
		$request ? `${$request.count} ${$request.count === 1 ? 'item' : 'items'}` : ''
	);
</script>

<Dialog
	open={$request !== null}
	onOpenChange={(open) => {
		if (!open) $request?.answer(false);
	}}
>
	<DialogContent class="max-w-md p-6">
		<DialogTitle>Sign out with {items} not synced?</DialogTitle>
		<DialogDescription>
			{one ? "It's" : "They're"} saved only on this device, and signing out deletes {one
				? 'it'
				: 'them'}. Stay signed in to keep {one ? 'it' : 'them'}.
		</DialogDescription>
		<div class="flex flex-wrap justify-end gap-2 pt-5">
			<Button
				variant="ghost"
				onclick={() => {
					$request?.answer(false);
					syncPanelOpen.set(true);
				}}
			>
				Review items
			</Button>
			<Button variant="outline" onclick={() => $request?.answer(false)}>Stay signed in</Button>
			<Button variant="destructive" onclick={() => $request?.answer(true)}>
				Sign out and delete
			</Button>
		</div>
	</DialogContent>
</Dialog>
