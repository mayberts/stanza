import { error, json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { readTrackTags } from '$lib/server/tags.js';
import type { RequestHandler } from './$types.js';

interface SearchBody {
	path: string;
	query?: { title?: string; artist?: string; album?: string };
}

export const POST: RequestHandler = async ({ request }) => {
	const deps = getDeps();
	const body = (await request.json()) as SearchBody;
	if (!body?.path) throw error(400, 'path is required');

	const tags = await readTrackTags(body.path);
	const trackName = body.query?.title ?? tags?.title;
	const artistName = body.query?.artist ?? tags?.artist;
	const albumName = body.query?.album ?? tags?.album ?? undefined;

	if (!trackName || !artistName) {
		throw error(400, 'Could not determine artist/title — provide them explicitly');
	}

	const candidates = await deps.lrclib.searchCandidates({ trackName, artistName, albumName });
	return json({ tags, candidates });
};
