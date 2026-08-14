import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LrclibClient, type LrclibRecord } from './lrclib.js';
import type { TrackTags } from './tags.js';

const BASE_URL = 'https://fake.lrclib.test/api';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function record(overrides: Partial<LrclibRecord> = {}): LrclibRecord {
	return {
		id: 1,
		trackName: 'Title',
		artistName: 'Artist',
		albumName: 'Album',
		duration: 200,
		instrumental: false,
		plainLyrics: 'plain',
		syncedLyrics: '[00:01.00]synced',
		...overrides
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('LrclibClient.fetchLyrics', () => {
	it('returns the exact /get match without ever calling /search', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(record({ plainLyrics: 'exact match' })));
		const client = new LrclibClient(BASE_URL);

		const tags: TrackTags = { artist: 'Artist', title: 'Title', album: 'Album', durationSec: 200 };
		const result = await client.fetchLyrics(tags);

		expect(result?.plainLyrics).toBe('exact match');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toContain('/get?');
	});

	it('falls back to search when /get 404s, preferring synced over a closer-duration plain match', async () => {
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes('/get?')) return jsonResponse(null, 404);
			if (url.includes('/search?')) {
				return jsonResponse([
					record({ id: 1, duration: 201, syncedLyrics: null, plainLyrics: 'plain, close' }),
					record({ id: 2, duration: 195, syncedLyrics: '[00:01.00]synced, farther' })
				]);
			}
			throw new Error(`unexpected request: ${url}`);
		});
		const client = new LrclibClient(BASE_URL);

		const tags: TrackTags = { artist: 'Artist', title: 'Title', album: 'Album', durationSec: 200 };
		const result = await client.fetchLyrics(tags);

		expect(result?.syncedLyrics).toBe('[00:01.00]synced, farther');
	});

	it('excludes search candidates outside the duration tolerance', async () => {
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes('/get?')) return jsonResponse(null, 404);
			if (url.includes('/search?')) {
				// 30s away — well outside the 10s tolerance.
				return jsonResponse([record({ duration: 230 })]);
			}
			throw new Error(`unexpected request: ${url}`);
		});
		const client = new LrclibClient(BASE_URL);

		const tags: TrackTags = { artist: 'Artist', title: 'Title', album: 'Album', durationSec: 200 };
		const result = await client.fetchLyrics(tags);

		expect(result).toBeNull();
	});

	it('skips /get entirely when the track has no known duration', async () => {
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes('/search?')) return jsonResponse([record()]);
			throw new Error(`unexpected request: ${url}`);
		});
		const client = new LrclibClient(BASE_URL);

		const tags: TrackTags = { artist: 'Artist', title: 'Title', album: null, durationSec: null };
		const result = await client.fetchLyrics(tags);

		expect(result).not.toBeNull();
		expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes('/get?'))).toBe(true);
	});
});

describe('LrclibClient.searchCandidates', () => {
	it('tries the literal tags first, then falls back to stripped feat./remaster variants', async () => {
		const requested: string[] = [];
		fetchMock.mockImplementation(async (url: string) => {
			requested.push(url);
			// Only the fully-stripped "structured, primary artist + cleaned title" variant succeeds.
			if (url.includes('track_name=Song&artist_name=A&')) {
				return jsonResponse([record({ trackName: 'Song', artistName: 'A' })]);
			}
			return jsonResponse([]);
		});
		const client = new LrclibClient(BASE_URL);

		const results = await client.searchCandidates({
			trackName: 'Song (Remastered 2009)',
			artistName: 'A feat. B',
			albumName: 'Album'
		});

		expect(results).toHaveLength(1);
		expect(results[0].artistName).toBe('A');
		// Stops as soon as a variant succeeds — never tries the free-text fallback
		// for that same (artist, title) pair once the structured search hit.
		expect(requested.at(-1)).toContain('track_name=Song&artist_name=A&');
		expect(requested.some((u) => u.includes('q='))).toBe(true); // earlier free-text attempts did happen
	});

	it('returns nothing when every variant search comes up empty', async () => {
		fetchMock.mockImplementation(async () => jsonResponse([])); // fresh Response per call — bodies aren't reusable
		const client = new LrclibClient(BASE_URL);

		const results = await client.searchCandidates({ trackName: 'Song', artistName: 'A' });

		expect(results).toEqual([]);
	});
});

describe('LrclibClient.publish', () => {
	it('solves the proof-of-work challenge and sends it as the publish token', async () => {
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url.endsWith('/request-challenge')) {
				// target 'f'.repeat(64) is satisfied by nonce 0 immediately.
				return jsonResponse({ prefix: 'abc', target: 'f'.repeat(64) });
			}
			if (url.endsWith('/publish')) {
				const token = (init?.headers as Record<string, string>)['X-Publish-Token'];
				expect(token).toBe('abc:0');
				const body = JSON.parse(String(init?.body));
				expect(body).toMatchObject({ trackName: 'Title', artistName: 'Artist' });
				return new Response(null, { status: 201 });
			}
			throw new Error(`unexpected request: ${url}`);
		});
		const client = new LrclibClient(BASE_URL);

		await client.publish({
			trackName: 'Title',
			artistName: 'Artist',
			albumName: 'Album',
			duration: 200,
			plainLyrics: 'plain'
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
