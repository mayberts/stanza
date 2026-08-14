import { error, json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { applyManualLyrics } from '$lib/server/pipeline.js';
import { readTrackTags } from '$lib/server/tags.js';
import type { RequestHandler } from './$types.js';

interface PublishBody {
	path: string;
	artist: string;
	title: string;
	album?: string;
	plainLyrics: string;
	syncedLyrics?: string | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const deps = getDeps();
	const body = (await request.json()) as PublishBody;

	if (!body?.path) throw error(400, 'path is required');
	if (!body.artist?.trim() || !body.title?.trim())
		throw error(400, 'artist and title are required');
	if (!body.plainLyrics?.trim()) throw error(400, 'plain lyrics are required to publish');

	// The track's own real duration, not anything the form could second-guess —
	// LRCLIB matches on this, so it has to be right.
	const tags = await readTrackTags(body.path);
	if (tags?.durationSec == null) {
		throw error(400, "Could not determine this track's duration — can't publish without it");
	}

	let published = true;
	let publishError: string | undefined;
	try {
		await deps.lrclib.publish({
			trackName: body.title.trim(),
			artistName: body.artist.trim(),
			albumName: body.album?.trim() ?? '',
			duration: tags.durationSec,
			plainLyrics: body.plainLyrics.trim(),
			syncedLyrics: body.syncedLyrics?.trim() || null
		});
	} catch (err) {
		published = false;
		publishError = err instanceof Error ? err.message : String(err);
		deps.logger.error(
			`LRCLIB publish failed for "${body.artist} - ${body.title}": ${publishError}`
		);
	}

	// Save locally either way — the contribution to LRCLIB and fixing your own
	// file are two separate wins, and a publish failure shouldn't cost you the
	// one you were guaranteed to get.
	try {
		await applyManualLyrics(deps, body.path, {
			syncedLyrics: body.syncedLyrics?.trim() || null,
			plainLyrics: body.plainLyrics.trim()
		});
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : String(err));
	}

	return json({ ok: true, published, publishError });
};
