import { readFile } from 'node:fs/promises';
import { getMtimeMs, type PipelineDeps } from './pipeline.js';
import { readTrackTags } from './tags.js';
import { lrcExists, lrcPathFor, writeLrc } from './writer.js';

export interface OverrideRecord {
	path: string;
	artist: string | null;
	title: string | null;
	album: string | null;
	durationSec: number | null;
	status: 'synced' | 'plain';
	lyrics: string;
}

export interface OverridesExport {
	version: 1;
	exportedAt: string;
	overrides: OverrideRecord[];
}

export interface ImportResult {
	imported: number;
	skipped: { path: string; reason: string }[];
}

/** Manually-applied matches ("Fix match" / "Contribute lyrics"), each bundled
 * with the .lrc content it wrote. The manual_override DB flag alone isn't
 * enough to back these up: it's keyed to a DB row that can be lost on a
 * rebuild, migration, or a fresh /config volume — this captures the actual
 * lyrics too, so a restore doesn't depend on the .lrc files having survived
 * whatever wiped the DB. */
export async function exportOverrides(deps: PipelineDeps): Promise<OverridesExport> {
	const rows = deps.db.listManualOverrides();
	const overrides: OverrideRecord[] = [];

	for (const row of rows) {
		if (row.status !== 'synced' && row.status !== 'plain') continue;
		let lyrics: string;
		try {
			lyrics = await readFile(lrcPathFor(row.path), 'utf8');
		} catch {
			continue; // .lrc vanished since the DB was updated; nothing to export
		}
		overrides.push({
			path: row.path,
			artist: row.artist,
			title: row.title,
			album: row.album,
			durationSec: row.durationSec,
			status: row.status,
			lyrics
		});
	}

	return { version: 1, exportedAt: new Date().toISOString(), overrides };
}

/** Restores manual overrides from a previous export. Never overwrites a
 * `.lrc` file that already exists with different content — an existing file
 * that byte-for-byte matches the backup is just re-flagged as protected, an
 * existing file that doesn't is left alone and reported as skipped, and only
 * a genuinely missing `.lrc` gets (re)written from the backup. */
export async function importOverrides(
	deps: PipelineDeps,
	data: Pick<OverridesExport, 'overrides'>
): Promise<ImportResult> {
	const result: ImportResult = { imported: 0, skipped: [] };

	for (const record of data.overrides ?? []) {
		if (!record?.path || !record.lyrics) {
			result.skipped.push({ path: record?.path ?? '(unknown)', reason: 'malformed record' });
			continue;
		}

		let mtimeMs: number;
		try {
			mtimeMs = await getMtimeMs(record.path);
		} catch {
			result.skipped.push({ path: record.path, reason: 'track file not found' });
			continue;
		}

		if (lrcExists(record.path)) {
			const current = await readFile(lrcPathFor(record.path), 'utf8');
			if (current !== record.lyrics) {
				result.skipped.push({
					path: record.path,
					reason: 'a different .lrc file already exists here — left alone'
				});
				continue;
			}
		} else {
			await writeLrc(record.path, record.lyrics);
		}

		const tags = await readTrackTags(record.path);
		deps.db.upsert({
			path: record.path,
			mtimeMs,
			artist: tags?.artist ?? record.artist,
			title: tags?.title ?? record.title,
			album: tags?.album ?? record.album,
			durationSec: tags?.durationSec ?? record.durationSec,
			status: record.status,
			wroteLrc: true,
			manualOverride: true,
			checkedAt: Date.now()
		});
		result.imported++;
	}

	return result;
}
