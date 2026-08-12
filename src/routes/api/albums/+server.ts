import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ url }) => {
	const deps = getDeps();
	const artist = url.searchParams.get('artist') ?? undefined;
	return json({ albums: deps.db.distinctAlbums(artist) });
};
