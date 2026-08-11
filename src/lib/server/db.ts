import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const ALL_STATUSES = [
	'synced',
	'plain',
	'not_found',
	'skipped_existing',
	'no_tags',
	'error'
] as const;
export type TrackStatus = (typeof ALL_STATUSES)[number];

export interface TrackRow {
	path: string;
	mtimeMs: number;
	artist: string | null;
	title: string | null;
	album: string | null;
	durationSec: number | null;
	status: TrackStatus;
	wroteLrc: boolean;
	checkedAt: number;
}

interface TrackTableRow {
	path: string;
	mtime_ms: number;
	artist: string | null;
	title: string | null;
	album: string | null;
	duration_sec: number | null;
	status: TrackStatus;
	wrote_lrc: number;
	checked_at: number;
}

function fromRow(row: TrackTableRow): TrackRow {
	return {
		path: row.path,
		mtimeMs: row.mtime_ms,
		artist: row.artist,
		title: row.title,
		album: row.album,
		durationSec: row.duration_sec,
		status: row.status,
		wroteLrc: row.wrote_lrc === 1,
		checkedAt: row.checked_at
	};
}

export class StanzaDb {
	private readonly db: Database.Database;

	constructor(dbPath: string) {
		if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
		this.db = new Database(dbPath);
		this.db.pragma('journal_mode = WAL');
		this.migrate();
	}

	private migrate(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS tracks (
				path TEXT PRIMARY KEY,
				mtime_ms INTEGER NOT NULL,
				artist TEXT,
				title TEXT,
				album TEXT,
				duration_sec INTEGER,
				status TEXT NOT NULL,
				wrote_lrc INTEGER NOT NULL DEFAULT 0,
				checked_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS tracks_status_idx ON tracks (status);
		`);
	}

	get(path: string): TrackRow | undefined {
		const row = this.db.prepare('SELECT * FROM tracks WHERE path = ?').get(path) as
			TrackTableRow | undefined;
		return row ? fromRow(row) : undefined;
	}

	upsert(row: TrackRow): void {
		this.db
			.prepare(
				`INSERT INTO tracks (path, mtime_ms, artist, title, album, duration_sec, status, wrote_lrc, checked_at)
				 VALUES (@path, @mtimeMs, @artist, @title, @album, @durationSec, @status, @wroteLrc, @checkedAt)
				 ON CONFLICT(path) DO UPDATE SET
					mtime_ms = excluded.mtime_ms,
					artist = excluded.artist,
					title = excluded.title,
					album = excluded.album,
					duration_sec = excluded.duration_sec,
					status = excluded.status,
					wrote_lrc = excluded.wrote_lrc,
					checked_at = excluded.checked_at`
			)
			.run({
				path: row.path,
				mtimeMs: row.mtimeMs,
				artist: row.artist,
				title: row.title,
				album: row.album,
				durationSec: row.durationSec,
				status: row.status,
				wroteLrc: row.wroteLrc ? 1 : 0,
				checkedAt: row.checkedAt
			});
	}

	delete(path: string): void {
		this.db.prepare('DELETE FROM tracks WHERE path = ?').run(path);
	}

	/** Paths tracked under a directory that no longer exist on disk, for orphan cleanup. */
	pathsUnder(dir: string): string[] {
		const rows = this.db.prepare('SELECT path FROM tracks WHERE path LIKE ?').all(`${dir}%`) as {
			path: string;
		}[];
		return rows.map((r) => r.path);
	}

	list(options: { status?: string; q?: string; limit: number; offset: number }): {
		rows: TrackRow[];
		total: number;
	} {
		const clauses: string[] = [];
		const params: Record<string, unknown> = {};

		if (options.status) {
			clauses.push('status = @status');
			params.status = options.status;
		}
		if (options.q) {
			clauses.push('(path LIKE @q OR artist LIKE @q OR title LIKE @q OR album LIKE @q)');
			params.q = `%${options.q}%`;
		}
		const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

		const total = (
			this.db.prepare(`SELECT COUNT(*) AS c FROM tracks ${where}`).get(params) as { c: number }
		).c;

		const rows = this.db
			.prepare(
				`SELECT * FROM tracks ${where} ORDER BY artist, album, path LIMIT @limit OFFSET @offset`
			)
			.all({ ...params, limit: options.limit, offset: options.offset }) as TrackTableRow[];

		return { rows: rows.map(fromRow), total };
	}

	statsCounts(): Record<TrackStatus, number> {
		const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
			TrackStatus,
			number
		>;
		const rows = this.db
			.prepare('SELECT status, COUNT(*) AS c FROM tracks GROUP BY status')
			.all() as {
			status: TrackStatus;
			c: number;
		}[];
		for (const row of rows) counts[row.status] = row.c;
		return counts;
	}

	close(): void {
		this.db.close();
	}
}
