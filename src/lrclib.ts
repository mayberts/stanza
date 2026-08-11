import type { TrackTags } from './tags.js';

export interface LyricsResult {
	syncedLyrics: string | null;
	plainLyrics: string | null;
	instrumental: boolean;
}

interface LrclibRecord {
	trackName: string;
	artistName: string;
	albumName: string | null;
	duration: number | null;
	instrumental: boolean;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

/** LRCLIB's own tolerance on /get is tight; widen it for our /search fallback. */
const SEARCH_DURATION_TOLERANCE_SEC = 3;

function toResult(record: LrclibRecord): LyricsResult {
	return {
		syncedLyrics: record.syncedLyrics,
		plainLyrics: record.plainLyrics,
		instrumental: record.instrumental
	};
}

export class LrclibClient {
	constructor(
		private readonly baseUrl: string,
		private readonly userAgent = 'stanza (https://github.com/mayberts/stanza)'
	) {}

	async fetchLyrics(tags: TrackTags): Promise<LyricsResult | null> {
		const exact = await this.get(tags);
		if (exact) return toResult(exact);
		return this.search(tags);
	}

	private async get(tags: TrackTags): Promise<LrclibRecord | null> {
		if (tags.durationSec == null) return null;

		const params = new URLSearchParams({
			track_name: tags.title,
			artist_name: tags.artist,
			duration: String(tags.durationSec)
		});
		if (tags.album) params.set('album_name', tags.album);

		const res = await fetch(`${this.baseUrl}/get?${params}`, {
			headers: { 'User-Agent': this.userAgent }
		});
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`LRCLIB /get failed: ${res.status} ${res.statusText}`);
		return (await res.json()) as LrclibRecord;
	}

	private async search(tags: TrackTags): Promise<LyricsResult | null> {
		const params = new URLSearchParams({ track_name: tags.title, artist_name: tags.artist });
		const res = await fetch(`${this.baseUrl}/search?${params}`, {
			headers: { 'User-Agent': this.userAgent }
		});
		if (!res.ok) throw new Error(`LRCLIB /search failed: ${res.status} ${res.statusText}`);

		const records = (await res.json()) as LrclibRecord[];
		if (records.length === 0) return null;

		const candidates =
			tags.durationSec == null
				? records
				: records.filter(
						(r) =>
							r.duration != null &&
							Math.abs(r.duration - tags.durationSec!) <= SEARCH_DURATION_TOLERANCE_SEC
					);
		if (candidates.length === 0) return null;

		// Prefer a synced match; among ties, the closest duration.
		const best = candidates
			.slice()
			.sort((a, b) => {
				if (!!a.syncedLyrics !== !!b.syncedLyrics) return a.syncedLyrics ? -1 : 1;
				const da = a.duration == null ? Infinity : Math.abs(a.duration - (tags.durationSec ?? 0));
				const db = b.duration == null ? Infinity : Math.abs(b.duration - (tags.durationSec ?? 0));
				return da - db;
			})
			.at(0)!;

		return toResult(best);
	}
}
