import { stat } from 'node:fs/promises';
import { needsProcessing, processTrack, removeTrack, type PipelineDeps } from './pipeline.js';
import { walkAudioFiles } from './scanner.js';

export interface ScanResult {
	scanned: number;
	processed: number;
	removed: number;
}

export async function runFullScan(deps: PipelineDeps): Promise<ScanResult> {
	const { config, db, logger } = deps;
	const retryCutoffMs = Date.now() - config.retryNotFoundAfterHours * 60 * 60 * 1000;

	const seen = new Set<string>();
	let scanned = 0;
	let processed = 0;

	for await (const filePath of walkAudioFiles(config.musicDir)) {
		seen.add(filePath);
		scanned++;

		let mtimeMs: number;
		try {
			mtimeMs = (await stat(filePath)).mtimeMs;
		} catch {
			continue;
		}

		const existing = db.get(filePath);
		if (needsProcessing(existing, mtimeMs, retryCutoffMs)) {
			await processTrack(deps, filePath);
			processed++;
		}
	}

	let removed = 0;
	for (const knownPath of db.pathsUnder(config.musicDir)) {
		if (!seen.has(knownPath)) {
			await removeTrack(deps, knownPath);
			removed++;
		}
	}

	logger.info(`Scan complete: ${scanned} tracks seen, ${processed} processed, ${removed} removed`);
	return { scanned, processed, removed };
}
