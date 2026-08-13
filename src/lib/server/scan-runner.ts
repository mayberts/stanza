import type { TrackFilter } from './db.js';
import type { PipelineDeps } from './pipeline.js';
import { runFilteredScan, runFullScan, type ScanResult } from './scan.js';

let scanning = false;
let lastResult: ScanResult | null = null;
let lastError: string | null = null;
let lastFinishedAt: number | null = null;

export function isScanning(): boolean {
	return scanning;
}

export function getLastScan(): {
	result: ScanResult | null;
	error: string | null;
	finishedAt: number | null;
} {
	return { result: lastResult, error: lastError, finishedAt: lastFinishedAt };
}

/** Fire-and-forget: starts a scan if one isn't already running. Safe to call often. */
export function triggerScan(
	deps: PipelineDeps,
	options: { force?: boolean; filter?: TrackFilter } = {}
): { started: boolean } {
	if (scanning) return { started: false };
	scanning = true;
	const work = options.filter
		? runFilteredScan(deps, options.filter)
		: runFullScan(deps, { force: options.force });
	work
		.then((result) => {
			lastResult = result;
			lastError = null;
		})
		.catch((err: unknown) => {
			lastError = String(err);
			deps.logger.error(`Scan failed: ${String(err)}`);
		})
		.finally(() => {
			scanning = false;
			lastFinishedAt = Date.now();
		});
	return { started: true };
}
