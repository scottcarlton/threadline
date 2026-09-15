/**
 * Run work after the response has been sent.
 *
 * Audit writes must not sit in the request's critical path. On Vercel's Fluid
 * Compute runtime `waitUntil` keeps the instance alive until the promise
 * settles; outside Vercel (local dev, vitest) there is no such hook, so we fall
 * back to a floating promise, which is fine because those environments are not
 * torn down mid-flight.
 *
 * The import is lazy and failure-tolerant so the module works in every
 * environment without a build-time Vercel dependency.
 */
export async function defer(work: () => Promise<void>): Promise<void> {
	const promise = work().catch(() => {
		// The caller is responsible for its own error reporting. Swallow here so a
		// failed background write can never surface as an unhandled rejection.
	});

	try {
		const { waitUntil } = await import('@vercel/functions');
		waitUntil(promise);
	} catch {
		// Not running on Vercel, or no active request context. The floating
		// promise above still runs to completion in a long-lived process.
	}
}
