export type TrackStatus =
	'synced' | 'plain' | 'not_found' | 'skipped_existing' | 'no_tags' | 'error';

export interface TrackRow {
	path: string;
	mtimeMs: number;
	artist: string | null;
	title: string | null;
	album: string | null;
	durationSec: number | null;
	status: TrackStatus;
	wroteLrc: boolean;
	manualOverride: boolean;
	checkedAt: number;
}

export interface LrclibRecord {
	id: number;
	trackName: string;
	artistName: string;
	albumName: string | null;
	duration: number | null;
	instrumental: boolean;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

export const ALL_STATUSES: TrackStatus[] = [
	'synced',
	'plain',
	'not_found',
	'skipped_existing',
	'no_tags',
	'error'
];

export const STATUS_LABELS: Record<TrackStatus, string> = {
	synced: 'Synced',
	plain: 'Plain',
	not_found: 'Not found',
	skipped_existing: 'Existing lyrics',
	no_tags: 'No tags',
	error: 'Error'
};

export function formatDuration(seconds: number | null): string {
	if (seconds == null) return '—';
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

export function trackFileName(path: string): string {
	return path.split('/').pop() ?? path;
}
