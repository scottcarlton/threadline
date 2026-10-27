import { env } from '$env/dynamic/private';

/**
 * The beta period: every org has full access for free. Separate from the
 * sign-in whitelist (BETA_WHITELIST_ENABLED), which controls who can get in,
 * not whether they pay.
 *
 * On unless BETA_ENABLED is exactly "false", so a missing variable can never
 * open billing by accident.
 */
export function isBetaActive(): boolean {
	return env.BETA_ENABLED !== 'false';
}

/** Checkout stays closed during the beta so nobody is charged before it ends. */
export function isCheckoutOpen(): boolean {
	return !isBetaActive();
}
