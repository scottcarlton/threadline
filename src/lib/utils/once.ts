/**
 * Calls `fn` at most once and returns its result to every caller after that.
 *
 * Exists for per-request lazy values on `locals`. The alternative -- having one
 * `load` populate a field that other `load`s read -- looks equivalent and is
 * not: SvelteKit runs layout and page loads in parallel, so the reader can win
 * the race and see an unset field. That is how `/invoices` shipped rendering
 * zero rows against a database holding three.
 *
 * The result is cached, not the settled value, so concurrent callers share one
 * in-flight promise rather than starting a second call. A rejection is cached
 * too: a caller that retries would re-run work that just failed, and every
 * caller in a single request should agree on what happened.
 */
export function once<T>(fn: () => T): () => T {
	let called = false;
	let value: T;
	return () => {
		if (!called) {
			called = true;
			value = fn();
		}
		return value;
	};
}
