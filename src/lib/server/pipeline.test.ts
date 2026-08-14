import { describe, expect, it } from 'vitest';
import type { TrackRow } from './db.js';
import { needsProcessing } from './pipeline.js';

const NOW = 1_700_000_000_000;
const RETRY_CUTOFF = NOW - 24 * 60 * 60 * 1000; // needsProcessing takes the absolute cutoff, not a duration
const UPGRADE_CUTOFF = NOW - 7 * 24 * 60 * 60 * 1000;

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
		checkedAt: NOW,
		...overrides
	};
}

describe('needsProcessing', () => {
	it('always processes a track with no existing row', () => {
		expect(needsProcessing(undefined, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(true);
	});

	it('never reprocesses a manually-overridden track, even when forced or mtime changed', () => {
		const existing = row({ manualOverride: true, mtimeMs: 1000 });
		expect(needsProcessing(existing, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
		expect(needsProcessing(existing, 999_999, RETRY_CUTOFF, UPGRADE_CUTOFF, true)).toBe(false);
	});

	it('reprocesses when mtime changed beyond the jitter tolerance', () => {
		const existing = row({ mtimeMs: 1000, status: 'synced' });
		expect(needsProcessing(existing, 1010, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(true);
	});

	it('treats mtime differences within the jitter tolerance as unchanged', () => {
		const existing = row({ mtimeMs: 1000, status: 'synced' });
		expect(needsProcessing(existing, 1004, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
		expect(needsProcessing(existing, 996, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
	});

	it('never re-fetches a resolved synced match outside of a mtime change', () => {
		const existing = row({ status: 'synced', checkedAt: 0 });
		expect(needsProcessing(existing, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
		expect(needsProcessing(existing, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF, true)).toBe(false);
	});

	describe('not_found / error retry cooldown', () => {
		it('retries once past the cutoff', () => {
			const stale = row({ status: 'not_found', checkedAt: RETRY_CUTOFF - 1 });
			expect(needsProcessing(stale, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(true);
		});

		it('does not retry before the cutoff', () => {
			const fresh = row({ status: 'error', checkedAt: RETRY_CUTOFF + 1 });
			expect(needsProcessing(fresh, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
		});

		it('force bypasses the cooldown', () => {
			const fresh = row({ status: 'not_found', checkedAt: RETRY_CUTOFF + 1 });
			expect(needsProcessing(fresh, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF, true)).toBe(true);
		});
	});

	describe('plain -> synced upgrade cooldown', () => {
		it('rechecks once past the (longer) upgrade cutoff', () => {
			const stale = row({ status: 'plain', checkedAt: UPGRADE_CUTOFF - 1 });
			expect(needsProcessing(stale, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(true);
		});

		it('does not recheck before the upgrade cutoff, even if past the shorter retry cutoff', () => {
			const fresh = row({ status: 'plain', checkedAt: RETRY_CUTOFF - 1 });
			expect(needsProcessing(fresh, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
		});

		it('force bypasses the upgrade cooldown', () => {
			const fresh = row({ status: 'plain', checkedAt: UPGRADE_CUTOFF + 1 });
			expect(needsProcessing(fresh, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF, true)).toBe(true);
		});
	});

	describe('skipped_existing (lyrics left alone)', () => {
		it('is left alone on a regular rescan', () => {
			const existing = row({ status: 'skipped_existing' });
			expect(needsProcessing(existing, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF)).toBe(false);
		});

		it('only re-reads tags on a forced rescan, never re-fetches lyrics via this flag alone', () => {
			const existing = row({ status: 'skipped_existing' });
			expect(needsProcessing(existing, 1000, RETRY_CUTOFF, UPGRADE_CUTOFF, true)).toBe(true);
		});
	});
});
