import { stat } from 'node:fs/promises';
import type { Config } from './config.js';
import { StanzaDb, type TrackRow } from './db.js';
import type { Logger } from './logger.js';
import { LrclibClient } from './lrclib.js';
import { readTrackTags } from './tags.js';
import { deleteLrc, lrcExists, writeLrc } from './writer.js';
import type { RateLimiter } from './rate-limiter.js';

export interface PipelineDeps {
	config: Config;
	db: StanzaDb;
	lrclib: LrclibClient;
	logger: Logger;
	rateLimiter: RateLimiter;
}

/** Whether a track is worth re-checking, given its last-known DB state. */
export function needsProcessing(
	existing: TrackRow | undefined,
	mtimeMs: number,
	retryCutoffMs: number
): boolean {
	if (!existing) return true;
	if (existing.mtimeMs !== mtimeMs) return true;
	if (existing.status === 'not_found') return existing.checkedAt < retryCutoffMs;
	return false;
}

export async function processTrack(deps: PipelineDeps, filePath: string): Promise<void> {
	const { config, db, lrclib, logger, rateLimiter } = deps;

	let mtimeMs: number;
	try {
		mtimeMs = (await stat(filePath)).mtimeMs;
	} catch {
		// File vanished between being listed and being processed (e.g. a watcher
		// race during a rename) — nothing to do.
		return;
	}

	const now = Date.now();

	if (lrcExists(filePath) && !config.overwriteExisting) {
		const existing = db.get(filePath);
		if (!existing?.wroteLrc) {
			db.upsert({
				path: filePath,
				mtimeMs,
				artist: null,
				title: null,
				album: null,
				durationSec: null,
				status: 'skipped_existing',
				wroteLrc: false,
				checkedAt: now
			});
			logger.debug(`Skipping (lyrics already exist): ${filePath}`);
			return;
		}
	}

	const tags = await readTrackTags(filePath);
	if (!tags) {
		db.upsert({
			path: filePath,
			mtimeMs,
			artist: null,
			title: null,
			album: null,
			durationSec: null,
			status: 'no_tags',
			wroteLrc: false,
			checkedAt: now
		});
		logger.warn(`No usable artist/title tags, skipping: ${filePath}`);
		return;
	}

	await rateLimiter.wait();

	let result;
	try {
		result = await lrclib.fetchLyrics(tags);
	} catch (err) {
		db.upsert({
			path: filePath,
			mtimeMs,
			artist: tags.artist,
			title: tags.title,
			album: tags.album,
			durationSec: tags.durationSec,
			status: 'error',
			wroteLrc: false,
			checkedAt: now
		});
		logger.error(`LRCLIB lookup failed for "${tags.artist} - ${tags.title}": ${String(err)}`);
		return;
	}

	const content = result?.syncedLyrics ?? result?.plainLyrics;
	if (!content) {
		db.upsert({
			path: filePath,
			mtimeMs,
			artist: tags.artist,
			title: tags.title,
			album: tags.album,
			durationSec: tags.durationSec,
			status: 'not_found',
			wroteLrc: false,
			checkedAt: now
		});
		logger.info(`No lyrics found: ${tags.artist} - ${tags.title}`);
		return;
	}

	await writeLrc(filePath, content);
	const status = result!.syncedLyrics ? 'synced' : 'plain';
	db.upsert({
		path: filePath,
		mtimeMs,
		artist: tags.artist,
		title: tags.title,
		album: tags.album,
		durationSec: tags.durationSec,
		status,
		wroteLrc: true,
		checkedAt: now
	});
	logger.info(`Wrote ${status} lyrics: ${tags.artist} - ${tags.title}`);
}

export async function removeTrack(deps: PipelineDeps, filePath: string): Promise<void> {
	const existing = deps.db.get(filePath);
	if (existing?.wroteLrc) {
		await deleteLrc(filePath);
		deps.logger.info(`Removed orphaned lyrics for deleted track: ${filePath}`);
	}
	deps.db.delete(filePath);
}
