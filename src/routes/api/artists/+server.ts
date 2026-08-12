import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = () => {
	const deps = getDeps();
	return json({ artists: deps.db.distinctArtists() });
};
