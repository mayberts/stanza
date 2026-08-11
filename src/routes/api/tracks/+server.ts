import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ url }) => {
	const deps = getDeps();
	const status = url.searchParams.get('status') ?? undefined;
	const q = url.searchParams.get('q') ?? undefined;
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200);
	const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

	const { rows, total } = deps.db.list({ status, q, limit, offset });
	return json({ rows, total, limit, offset });
};
