import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { solveChallenge } from './lrclib-challenge.js';

describe('solveChallenge', () => {
	it('finds a nonce whose sha256(prefix + nonce) is <= target', () => {
		const challenge = { prefix: 'stanza-test', target: 'f'.repeat(64) };
		const nonce = solveChallenge(challenge);

		const hash = createHash('sha256')
			.update(challenge.prefix + nonce)
			.digest('hex');
		expect(BigInt(`0x${hash}`)).toBeLessThanOrEqual(BigInt(`0x${challenge.target}`));
	});

	it('is deterministic for the same challenge', () => {
		const challenge = { prefix: 'stanza-test', target: 'f'.repeat(64) };
		expect(solveChallenge(challenge)).toBe(solveChallenge(challenge));
	});

	it('throws once the iteration budget is exhausted for an unsatisfiable target', () => {
		// An all-zero target is only satisfied by a hash of exactly zero —
		// practically never — so a small iteration cap should exhaust immediately.
		const challenge = { prefix: 'stanza-test', target: '0'.repeat(64) };
		expect(() => solveChallenge(challenge, 10)).toThrow(/iteration limit/);
	});
});
