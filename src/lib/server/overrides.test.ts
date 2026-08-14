import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StanzaDb } from './db.js';
import { exportOverrides, importOverrides, type OverrideRecord } from './overrides.js';
import type { PipelineDeps } from './pipeline.js';

function fakeDeps(): PipelineDeps {
	return { db: new StanzaDb(':memory:') } as PipelineDeps;
}

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'stanza-overrides-test-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('exportOverrides', () => {
	it('bundles each manual override with its .lrc content', async () => {
		const deps = fakeDeps();
		const trackPath = join(dir, 'a.mp3');
		writeFileSync(trackPath, 'fake-audio');
		writeFileSync(join(dir, 'a.lrc'), '[00:01.00]hello');
		deps.db.upsert({
			path: trackPath,
			mtimeMs: 0,
			artist: 'Artist',
			title: 'Title',
			album: 'Album',
			durationSec: 200,
			status: 'synced',
			wroteLrc: true,
			manualOverride: true,
			checkedAt: Date.now()
		});

		const exported = await exportOverrides(deps);
		expect(exported.version).toBe(1);
		expect(exported.overrides).toEqual([
			{
				path: trackPath,
				artist: 'Artist',
				title: 'Title',
				album: 'Album',
				durationSec: 200,
				status: 'synced',
				lyrics: '[00:01.00]hello'
			}
		]);
	});

	it('excludes non-manual tracks and tracks whose .lrc has since vanished', async () => {
		const deps = fakeDeps();
		const untouchedPath = join(dir, 'untouched.mp3');
		const vanishedPath = join(dir, 'vanished.mp3');
		writeFileSync(untouchedPath, 'fake-audio');
		writeFileSync(vanishedPath, 'fake-audio');
		// Not a manual override — an ordinary automatic match.
		deps.db.upsert({
			path: untouchedPath,
			mtimeMs: 0,
			artist: null,
			title: null,
			album: null,
			durationSec: null,
			status: 'synced',
			wroteLrc: true,
			manualOverride: false,
			checkedAt: Date.now()
		});
		// A manual override whose .lrc file was deleted out from under the DB.
		deps.db.upsert({
			path: vanishedPath,
			mtimeMs: 0,
			artist: null,
			title: null,
			album: null,
			durationSec: null,
			status: 'synced',
			wroteLrc: true,
			manualOverride: true,
			checkedAt: Date.now()
		});

		const exported = await exportOverrides(deps);
		expect(exported.overrides).toEqual([]);
	});
});

describe('importOverrides', () => {
	it('re-flags a track as protected when the DB is lost but the .lrc survived, without touching the file', async () => {
		const deps = fakeDeps(); // simulates a freshly rebuilt DB with no rows at all
		const trackPath = join(dir, 'a.mp3');
		writeFileSync(trackPath, 'fake-audio');
		writeFileSync(join(dir, 'a.lrc'), '[00:01.00]hello');

		const result = await importOverrides(deps, {
			overrides: [
				{
					path: trackPath,
					artist: 'Artist',
					title: 'Title',
					album: 'Album',
					durationSec: 200,
					status: 'synced',
					lyrics: '[00:01.00]hello'
				}
			]
		});

		expect(result).toEqual({ imported: 1, skipped: [] });
		expect(deps.db.get(trackPath)?.manualOverride).toBe(true);
		expect(readFileSync(join(dir, 'a.lrc'), 'utf8')).toBe('[00:01.00]hello');
	});

	it('restores a missing .lrc file from the backup, then re-flags it', async () => {
		const deps = fakeDeps();
		const trackPath = join(dir, 'b.mp3');
		writeFileSync(trackPath, 'fake-audio');
		// No b.lrc on disk — it was lost along with the DB.

		const result = await importOverrides(deps, {
			overrides: [
				{
					path: trackPath,
					artist: 'Artist',
					title: 'Title',
					album: null,
					durationSec: 200,
					status: 'plain',
					lyrics: 'plain lyrics text'
				}
			]
		});

		expect(result.imported).toBe(1);
		expect(readFileSync(join(dir, 'b.lrc'), 'utf8')).toBe('plain lyrics text');
		expect(deps.db.get(trackPath)?.manualOverride).toBe(true);
	});

	it('never overwrites a local .lrc that has diverged from the backup', async () => {
		const deps = fakeDeps();
		const trackPath = join(dir, 'c.mp3');
		writeFileSync(trackPath, 'fake-audio');
		writeFileSync(join(dir, 'c.lrc'), 'a different local pick');

		const result = await importOverrides(deps, {
			overrides: [
				{
					path: trackPath,
					artist: 'Artist',
					title: 'Title',
					album: null,
					durationSec: 200,
					status: 'synced',
					lyrics: '[00:01.00]hello'
				}
			]
		});

		expect(result.imported).toBe(0);
		expect(result.skipped).toEqual([
			{ path: trackPath, reason: 'a different .lrc file already exists here — left alone' }
		]);
		expect(readFileSync(join(dir, 'c.lrc'), 'utf8')).toBe('a different local pick');
		expect(deps.db.get(trackPath)).toBeUndefined();
	});

	it('skips a record whose track file no longer exists', async () => {
		const deps = fakeDeps();
		const missingPath = join(dir, 'gone.mp3');

		const result = await importOverrides(deps, {
			overrides: [
				{
					path: missingPath,
					artist: 'Artist',
					title: 'Title',
					album: null,
					durationSec: 200,
					status: 'synced',
					lyrics: '[00:01.00]hello'
				}
			]
		});

		expect(result).toEqual({
			imported: 0,
			skipped: [{ path: missingPath, reason: 'track file not found' }]
		});
	});

	it('skips malformed records without throwing', async () => {
		const deps = fakeDeps();

		const malformed = [
			{ path: '', lyrics: '' },
			{ path: '/x.mp3' },
			null
		] as unknown as OverrideRecord[];
		const result = await importOverrides(deps, { overrides: malformed });

		expect(result.imported).toBe(0);
		expect(result.skipped.length).toBe(3);
		for (const item of result.skipped) {
			expect(item.reason).toBe('malformed record');
		}
	});
});
