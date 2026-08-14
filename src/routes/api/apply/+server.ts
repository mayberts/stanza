import { error, json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { applyManualLyrics } from '$lib/server/pipeline.js';
import type { RequestHandler } from './$types.js';

interface ApplyBody {
	path: string;
	syncedLyrics?: string | null;
	plainLyrics?: string | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const deps = getDeps();
	const body = (await request.json()) as ApplyBody;
	if (!body?.path) throw error(400, 'path is required');

	try {
		await applyManualLyrics(deps, body.path, body);
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : String(err));
	}

	return json({ ok: true });
};
