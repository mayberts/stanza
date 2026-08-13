import { basename, extname } from 'node:path';
import { parseFile } from 'music-metadata';

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav']);

export interface TrackTags {
	artist: string;
	title: string;
	album: string | null;
	durationSec: number | null;
}

/**
 * "1-08 Artist - Title.flac", "08. Artist - Title.flac" -> { artist, title }.
 * Only used when a file has no embedded artist/title at all — a common gap in
 * rips/downloads that otherwise encode this in the filename. Returns null if
 * there's no recognizable "Artist - Title" split, rather than guessing.
 */
function parseFilenameFallback(filePath: string): { artist: string; title: string } | null {
	const name = basename(filePath, extname(filePath));
	const withoutTrackNumber = name.replace(/^\d+(-\d+)?[.\s-]+/, '').trim();

	const separatorIndex = withoutTrackNumber.indexOf(' - ');
	if (separatorIndex === -1) return null;

	const artist = withoutTrackNumber.slice(0, separatorIndex).trim();
	const title = withoutTrackNumber.slice(separatorIndex + 3).trim();
	if (!artist || !title) return null;

	return { artist, title };
}

/** Returns null if the file couldn't be parsed, or has no usable artist/title
 * from either its embedded tags or its filename. */
export async function readTrackTags(filePath: string): Promise<TrackTags | null> {
	let metadata;
	try {
		metadata = await parseFile(filePath, { duration: true });
	} catch {
		return null;
	}

	const album = metadata.common.album?.trim() ?? null;
	const durationSec = metadata.format.duration ? Math.round(metadata.format.duration) : null;

	const embeddedArtist = metadata.common.artist?.trim();
	const embeddedTitle = metadata.common.title?.trim();
	if (embeddedArtist && embeddedTitle) {
		return { artist: embeddedArtist, title: embeddedTitle, album, durationSec };
	}

	const fromFilename = parseFilenameFallback(filePath);
	if (!fromFilename) return null;

	return { ...fromFilename, album, durationSec };
}
