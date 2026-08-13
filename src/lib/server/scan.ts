import { stat } from 'node:fs/promises';
import type { TrackFilter } from './db.js';
import { needsProcessing, processTrack, removeTrack, type PipelineDeps } from './pipeline.js';
import { walkAudioFiles } from './scanner.js';

export interface ScanResult {
	scanned: number;
	processed: number;
	removed: number;
}

export async function runFullScan(
	deps: PipelineDeps,
	options: { force?: boolean } = {}
): Promise<ScanResult> {
	const { config, db, logger } = deps;
	const retryCutoffMs = Date.now() - config.retryNotFoundAfterHours * 60 * 60 * 1000;
	const upgradeCutoffMs = Date.now() - config.upgradePlainAfterHours * 60 * 60 * 1000;
	const force = options.force ?? false;

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
		if (needsProcessing(existing, mtimeMs, retryCutoffMs, upgradeCutoffMs, force)) {
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

/**
 * Rechecks exactly the tracks matching a filter — e.g. everything currently
 * shown in the dashboard's "Existing lyrics" view — instead of the whole
 * library. Every matching track is reprocessed unconditionally, ignoring the
 * retry/upgrade cooldowns, since narrowing to a filter is itself the signal
 * that these specific tracks need another look. Doesn't touch orphan cleanup
 * (that's a full-scan concern) or overwrite lyrics Stanza didn't write.
 */
export async function runFilteredScan(
	deps: PipelineDeps,
	filter: TrackFilter
): Promise<ScanResult> {
	const { db, logger } = deps;
	const paths = db.listAllPaths(filter);

	for (const filePath of paths) {
		await processTrack(deps, filePath);
	}

	logger.info(`Filtered rescan complete: ${paths.length} tracks reprocessed`);
	return { scanned: paths.length, processed: paths.length, removed: 0 };
}
