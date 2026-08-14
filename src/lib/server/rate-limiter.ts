function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serializes callers so no two proceed less than `minIntervalMs` apart, app-wide. */
export class RateLimiter {
	private nextAvailableAt = 0;
	private queue: Promise<void> = Promise.resolve();

	constructor(private minIntervalMs: number) {}

	setMinIntervalMs(ms: number): void {
		this.minIntervalMs = ms;
	}

	async wait(): Promise<void> {
		const turn = this.queue;
		let release: () => void;
		this.queue = new Promise((resolve) => (release = resolve));
		await turn;

		const now = Date.now();
		const waitMs = Math.max(0, this.nextAvailableAt - now);
		if (waitMs > 0) await sleep(waitMs);
		this.nextAvailableAt = Date.now() + this.minIntervalMs;

		release!();
	}
}
