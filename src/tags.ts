import { parseFile } from 'music-metadata';

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav']);

export interface TrackTags {
	artist: string;
	title: string;
	album: string | null;
	durationSec: number | null;
}

/** Returns null if the file couldn't be parsed or is missing artist/title. */
export async function readTrackTags(filePath: string): Promise<TrackTags | null> {
	let metadata;
	try {
		metadata = await parseFile(filePath, { duration: true });
	} catch {
		return null;
	}

	const artist = metadata.common.artist?.trim();
	const title = metadata.common.title?.trim();
	if (!artist || !title) return null;

	return {
		artist,
		title,
		album: metadata.common.album?.trim() ?? null,
		durationSec: metadata.format.duration ? Math.round(metadata.format.duration) : null
	};
}
