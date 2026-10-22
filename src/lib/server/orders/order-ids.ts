import { createHash, randomUUID } from 'node:crypto';

/**
 * Stable ids for one order submission (SCO-204).
 *
 * The client sends a single `submission_id` per checkout. The server splits the
 * cart into one order per brand and season, so each order id is derived from
 * the submission id and its group key with UUIDv5: the same submission retried
 * after a dropped response yields the same order ids, and the database treats
 * them as a replay instead of a second set of orders. The inline (freeform)
 * account gets its own derived id the same way.
 */

// Fixed namespace for Threadline order submissions. Never change it: every
// derived id would change with it and retries would stop replaying.
const SUBMISSION_NAMESPACE = 'b2c1a0f4-3e5d-4c8b-9a7e-6f0d1c2b3a49';

function uuidBytes(uuid: string): Buffer {
	return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** RFC 4122 version 5 (SHA-1, name-based) UUID. */
export function uuidV5(name: string, namespace: string = SUBMISSION_NAMESPACE): string {
	const hash = createHash('sha1')
		.update(uuidBytes(namespace))
		.update(Buffer.from(name, 'utf8'))
		.digest();
	const bytes = hash.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type SubmissionIds = {
	submissionId: string;
	orderId: (brandId: string, seasonId: string | null) => string;
	accountId: () => string;
};

/**
 * Without a client submission id there is nothing to replay against, so a
 * random one keeps the write path identical and simply never matches.
 */
export function submissionIds(clientSubmissionId: string | null | undefined): SubmissionIds {
	const submissionId = clientSubmissionId ?? randomUUID();
	return {
		submissionId,
		orderId: (brandId, seasonId) => uuidV5(`${submissionId}:order:${brandId}:${seasonId ?? ''}`),
		accountId: () => uuidV5(`${submissionId}:account`)
	};
}
