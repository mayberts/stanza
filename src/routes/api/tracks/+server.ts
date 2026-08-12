import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ url }) => {
	const deps = getDeps();
	const status = url.searchParams.get('status') ?? undefined;
	const artist = url.searchParams.get('artist') ?? undefined;
	const album = url.searchParams.get('album') ?? undefined;
	const title = url.searchParams.get('title') ?? undefined;
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200);
	const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

	const { rows, total } = deps.db.list({ status, artist, album, title, limit, offset });
	return json({ rows, total, limit, offset });
};
