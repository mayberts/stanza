import { describe, expect, it } from 'vitest';
import { parseFilenameFallback } from './tags.js';

describe('parseFilenameFallback', () => {
	it('splits a plain "Artist - Title" filename', () => {
		expect(parseFilenameFallback('/music/Artist - Title.flac')).toEqual({
			artist: 'Artist',
			title: 'Title'
		});
	});

	it('strips a leading disc-track number like "1-08"', () => {
		expect(parseFilenameFallback('/music/1-08 Artist - Title.flac')).toEqual({
			artist: 'Artist',
			title: 'Title'
		});
	});

	it('strips a leading "08. " track number', () => {
		expect(parseFilenameFallback('/music/08. Artist - Title.mp3')).toEqual({
			artist: 'Artist',
			title: 'Title'
		});
	});

	it('strips a leading "08 - " track number', () => {
		expect(parseFilenameFallback('/music/08 - Artist - Title.mp3')).toEqual({
			artist: 'Artist',
			title: 'Title'
		});
	});

	it('trims surrounding whitespace around each half', () => {
		expect(parseFilenameFallback('/music/ Artist  -  Title .mp3')).toEqual({
			artist: 'Artist',
			title: 'Title'
		});
	});

	it('returns null when there is no " - " separator to split on', () => {
		expect(parseFilenameFallback('/music/JustATitle.mp3')).toBeNull();
	});

	it('returns null when the artist half would be empty', () => {
		expect(parseFilenameFallback('/music/ - Title.mp3')).toBeNull();
	});

	it('returns null when the title half would be empty', () => {
		expect(parseFilenameFallback('/music/Artist - .mp3')).toBeNull();
	});

	it('only splits on the first " - ", keeping the rest of the title intact', () => {
		expect(parseFilenameFallback('/music/Artist - Title - Remix.mp3')).toEqual({
			artist: 'Artist',
			title: 'Title - Remix'
		});
	});
});
