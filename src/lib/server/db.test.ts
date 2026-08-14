import { beforeEach, describe, expect, it } from 'vitest';
import { StanzaDb, type TrackRow } from './db.js';

function row(overrides: Partial<TrackRow> = {}): TrackRow {
	return {
		path: '/music/a.mp3',
		mtimeMs: 1000,
		artist: 'Artist',
		title: 'Title',
		album: 'Album',
		durationSec: 200,
		status: 'synced',
		wroteLrc: true,
		manualOverride: false,
		checkedAt: 1_700_000_000_000,
		...overrides
	};
}

let db: StanzaDb;

beforeEach(() => {
	db = new StanzaDb(':memory:');
});

describe('upsert / get', () => {
	it('round-trips every field, including manualOverride', () => {
		db.upsert(row({ manualOverride: true }));
		expect(db.get('/music/a.mp3')).toEqual(row({ manualOverride: true }));
	});

	it('overwrites on conflict rather than duplicating', () => {
		db.upsert(row({ status: 'not_found', wroteLrc: false }));
		db.upsert(row({ status: 'synced', wroteLrc: true }));

		expect(db.get('/music/a.mp3')?.status).toBe('synced');
		expect(db.list({ limit: 10, offset: 0 }).total).toBe(1);
	});

	it('returns undefined for a path never seen', () => {
		expect(db.get('/music/nope.mp3')).toBeUndefined();
	});
});

describe('delete', () => {
	it('removes the row', () => {
		db.upsert(row());
		db.delete('/music/a.mp3');
		expect(db.get('/music/a.mp3')).toBeUndefined();
	});
});

describe('listManualOverrides', () => {
	it('returns only rows with manualOverride set', () => {
		db.upsert(row({ path: '/music/auto.mp3', manualOverride: false }));
		db.upsert(row({ path: '/music/manual.mp3', manualOverride: true }));

		const overrides = db.listManualOverrides();
		expect(overrides.map((r) => r.path)).toEqual(['/music/manual.mp3']);
	});
});

describe('list filtering', () => {
	beforeEach(() => {
		db.upsert(row({ path: '/music/1.mp3', artist: 'Alpha', album: 'X', status: 'synced' }));
		db.upsert(row({ path: '/music/2.mp3', artist: 'Beta', album: 'Y', status: 'not_found' }));
		db.upsert(row({ path: '/music/3.mp3', artist: 'Alpha', album: 'X', status: 'plain' }));
	});

	it('filters by status', () => {
		const { rows, total } = db.list({ status: 'not_found', limit: 10, offset: 0 });
		expect(total).toBe(1);
		expect(rows[0].path).toBe('/music/2.mp3');
	});

	it('filters by artist and album together', () => {
		const { rows, total } = db.list({ artist: 'Alpha', album: 'X', limit: 10, offset: 0 });
		expect(total).toBe(2);
		expect(rows.map((r) => r.path).sort()).toEqual(['/music/1.mp3', '/music/3.mp3']);
	});

	it('paginates with limit/offset', () => {
		const page1 = db.list({ limit: 2, offset: 0 });
		const page2 = db.list({ limit: 2, offset: 2 });
		expect(page1.rows).toHaveLength(2);
		expect(page1.total).toBe(3);
		expect(page2.rows).toHaveLength(1);
	});

	it('listAllPaths ignores pagination entirely', () => {
		expect(db.listAllPaths({ artist: 'Alpha' }).sort()).toEqual(['/music/1.mp3', '/music/3.mp3']);
	});

	it('distinctArtists and distinctAlbums reflect current rows', () => {
		expect(db.distinctArtists()).toEqual(['Alpha', 'Beta']);
		expect(db.distinctAlbums('Alpha')).toEqual(['X']);
	});

	it('statsCounts tallies every status, including zero counts', () => {
		const counts = db.statsCounts();
		expect(counts.synced).toBe(1);
		expect(counts.not_found).toBe(1);
		expect(counts.plain).toBe(1);
		expect(counts.error).toBe(0);
	});
});

describe('pathsUnder', () => {
	it('matches only paths under the given directory prefix', () => {
		db.upsert(row({ path: '/music/albumA/1.mp3' }));
		db.upsert(row({ path: '/music/albumB/1.mp3' }));

		expect(db.pathsUnder('/music/albumA').sort()).toEqual(['/music/albumA/1.mp3']);
	});
});
