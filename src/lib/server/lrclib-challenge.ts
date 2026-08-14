import { createHash } from 'node:crypto';

export interface Challenge {
	prefix: string;
	target: string;
}

/**
 * LRCLIB's publish endpoint requires a small proof-of-work token first (an
 * anti-spam measure): find a nonce such that sha256(prefix + nonce), read as
 * a big number, is <= target. Both prefix and target come from
 * POST /api/request-challenge as hex strings.
 */
export function solveChallenge(challenge: Challenge, maxIterations = 50_000_000): string {
	const targetNum = BigInt(`0x${challenge.target}`);

	for (let nonce = 0; nonce < maxIterations; nonce++) {
		const hash = createHash('sha256')
			.update(challenge.prefix + nonce)
			.digest('hex');
		if (BigInt(`0x${hash}`) <= targetNum) {
			return String(nonce);
		}
	}

	throw new Error('Could not solve the LRCLIB publish challenge within the iteration limit');
}
