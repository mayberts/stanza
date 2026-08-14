import type { TrackTags } from './tags.js';

export interface LyricsResult {
	syncedLyrics: string | null;
	plainLyrics: string | null;
	instrumental: boolean;
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

export interface LrclibQuery {
	trackName: string;
	artistName: string;
	albumName?: string;
}

/** LRCLIB's own tolerance on /get is tight; widen it further for our /search
 * fallback. Community-submitted durations for the same song commonly vary by
 * several seconds across different rips/remasters/album pressings — a tight
 * window here means real synced matches silently get discarded in favor of
 * keeping a worse plain-only match, even though a human glancing at the same
 * search results would immediately recognize them as the same song. */
const SEARCH_DURATION_TOLERANCE_SEC = 10;

/** "Artist A feat./featuring/ft./with Artist B" — LRCLIB usually only credits the
 * primary artist, so a query carrying the full billing (guest artists and all)
 * often fails to match anything even when LRCLIB has the track. */
const FEATURING_PATTERN = /\s+(?:feat\.?|featuring|ft\.?|with)\s+.+$/i;

function primaryArtist(artistName: string): string | null {
	const stripped = artistName.replace(FEATURING_PATTERN, '').trim();
	return stripped && stripped.toLowerCase() !== artistName.toLowerCase() ? stripped : null;
}

/** Edition/remaster tags that describe packaging, not the recording itself —
 * safe to strip because LRCLIB's canonical entry is almost never titled with
 * them. Deliberately excludes anything that could be a genuinely different
 * performance with different lyrics/timing (remix, live, acoustic, cover,
 * demo) — stripping those risks matching to the wrong recording entirely. */
const TITLE_NOISE_PHRASES = [
	'(?:\\d{4}\\s+)?digitally\\s+remaster(?:ed)?(?:\\s+\\d{4})?',
	'remaster(?:ed)?(?:\\s+\\d{4})?',
	'\\d{4}\\s+remaster(?:ed)?',
	'album\\s+version',
	'single\\s+version',
	'radio\\s+edit',
	'clean(?:\\s+version)?',
	'explicit(?:\\s+version)?',
	'mono(?:\\s+version)?',
	'stereo(?:\\s+version)?',
	'deluxe(?:\\s+edition)?',
	'expanded\\s+edition',
	'anniversary\\s+edition',
	'bonus\\s+track'
].join('|');

// Only strips a trailing " (Tag)"/" [Tag]"/" - Tag" — never touches text in
// the middle of a title, where it's far more likely to be load-bearing.
const TITLE_NOISE_PATTERN = new RegExp(
	`\\s*(?:[([](?:${TITLE_NOISE_PHRASES})[)\\]]|-\\s*(?:${TITLE_NOISE_PHRASES}))\\s*$`,
	'i'
);

function cleanedTitle(trackName: string): string | null {
	const stripped = trackName.replace(TITLE_NOISE_PATTERN, '').trim();
	return stripped && stripped.toLowerCase() !== trackName.toLowerCase() ? stripped : null;
}

function structuredParams(query: LrclibQuery): URLSearchParams {
	const params = new URLSearchParams({
		track_name: query.trackName,
		artist_name: query.artistName
	});
	if (query.albumName) params.set('album_name', query.albumName);
	return params;
}

function freeTextParams(query: LrclibQuery): URLSearchParams {
	const q = [query.artistName, query.trackName].filter(Boolean).join(' ').trim();
	return new URLSearchParams({ q });
}

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
		return this.autoPickFromSearch(tags);
	}

	/**
	 * Raw search results, for manual review — no duration filtering or ranking
	 * applied. Tries progressively looser queries until one finds something:
	 * structured params (precise when tags are clean), then a free-text query
	 * (matches lrclib.net's own search box) — for the artist/title as tagged,
	 * then again with any "feat." billing stripped to the primary artist
	 * and/or any remaster/edition noise stripped from the title, since either
	 * one alone can be why an otherwise-present track fails to match.
	 */
	async searchCandidates(query: LrclibQuery): Promise<LrclibRecord[]> {
		const artistVariants = [query.artistName, primaryArtist(query.artistName)].filter(
			(a): a is string => !!a
		);
		const titleVariants = [query.trackName, cleanedTitle(query.trackName)].filter(
			(t): t is string => !!t
		);

		for (const artistName of artistVariants) {
			for (const trackName of titleVariants) {
				const variant = { ...query, artistName, trackName };
				const structured = await this.rawSearch(structuredParams(variant));
				if (structured.length > 0) return structured;
				const freeText = await this.rawSearch(freeTextParams(variant));
				if (freeText.length > 0) return freeText;
			}
		}
		return [];
	}

	private async rawSearch(params: URLSearchParams): Promise<LrclibRecord[]> {
		const res = await fetch(`${this.baseUrl}/search?${params}`, {
			headers: { 'User-Agent': this.userAgent }
		});
		if (!res.ok) throw new Error(`LRCLIB /search failed: ${res.status} ${res.statusText}`);
		return (await res.json()) as LrclibRecord[];
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

	private async autoPickFromSearch(tags: TrackTags): Promise<LyricsResult | null> {
		const records = await this.searchCandidates({
			trackName: tags.title,
			artistName: tags.artist,
			albumName: tags.album ?? undefined
		});
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
