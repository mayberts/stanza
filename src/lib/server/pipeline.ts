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

/** Rounded to whole milliseconds: some filesystems (FUSE mounts like Unraid's
 * shfs, network shares) report mtime with sub-millisecond jitter between
 * separate stat() calls on a file that never actually changed — comparing the
 * raw float would make every track look "changed" on every single scan. */
export async function getMtimeMs(filePath: string): Promise<number> {
	return Math.round((await stat(filePath)).mtimeMs);
}

/** Whether a track is worth re-checking, given its last-known DB state. */
export function needsProcessing(
	existing: TrackRow | undefined,
	mtimeMs: number,
	retryCutoffMs: number,
	upgradeCutoffMs: number,
	force = false
): boolean {
	if (!existing) return true;
	if (existing.manualOverride) return false;
	if (existing.mtimeMs !== mtimeMs) return true;
	if (existing.status === 'not_found' || existing.status === 'error') {
		return force || existing.checkedAt < retryCutoffMs;
	}
	// Plain lyrics are a resolved-but-improvable state: LRCLIB may add synced
	// timing for a track later without us ever seeing it as not_found.
	if (existing.status === 'plain') {
		return force || existing.checkedAt < upgradeCutoffMs;
	}
	// Never re-fetches lyrics (existing ones are always left alone), but a
	// forced rescan re-reads tags — cheap, and backfills artist/title/album
	// for tracks recorded before their metadata was read (or not read at all).
	if (existing.status === 'skipped_existing' && force) {
		return true;
	}
	return false;
}

export async function processTrack(deps: PipelineDeps, filePath: string): Promise<void> {
	const { config, db, lrclib, logger, rateLimiter } = deps;

	let mtimeMs: number;
	try {
		mtimeMs = await getMtimeMs(filePath);
	} catch {
		// File vanished between being listed and being processed (e.g. a watcher
		// race during a rename) — nothing to do.
		return;
	}

	const now = Date.now();

	// A human picked this match via "Fix match" — never let automatic matching
	// (a rescan, an upgrade check, a bulk filtered rescan) silently replace it.
	const existing = db.get(filePath);
	if (existing?.manualOverride) {
		logger.debug(`Skipping (manually matched): ${filePath}`);
		return;
	}

	const tags = await readTrackTags(filePath);

	if (lrcExists(filePath) && !config.overwriteExisting) {
		if (!existing?.wroteLrc) {
			db.upsert({
				path: filePath,
				mtimeMs,
				artist: tags?.artist ?? null,
				title: tags?.title ?? null,
				album: tags?.album ?? null,
				durationSec: tags?.durationSec ?? null,
				status: 'skipped_existing',
				wroteLrc: false,
				manualOverride: false,
				checkedAt: now
			});
			logger.debug(`Skipping (lyrics already exist): ${filePath}`);
			return;
		}
	}

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
			manualOverride: false,
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
			manualOverride: false,
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
			manualOverride: false,
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
		manualOverride: false,
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
