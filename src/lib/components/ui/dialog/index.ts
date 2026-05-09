import { Dialog as DialogPrimitive } from 'bits-ui';

const Root = DialogPrimitive.Root;
const Trigger = DialogPrimitive.Trigger;
const Portal = DialogPrimitive.Portal;
const Close = DialogPrimitive.Close;

export {
	Root,
	Trigger,
	Portal,
	Close,
	Root as Dialog,
	Trigger as DialogTrigger,
	Portal as DialogPortal,
	Close as DialogClose
};

export { default as DialogContent } from './dialog-content.svelte';
export { default as DialogOverlay } from './dialog-overlay.svelte';
export { default as DialogTitle } from './dialog-title.svelte';
export { default as DialogDescription } from './dialog-description.svelte';
