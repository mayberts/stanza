import { stat } from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { readTrackTags } from '$lib/server/tags.js';
import { writeLrc } from '$lib/server/writer.js';
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

	const content = body.syncedLyrics || body.plainLyrics;
	if (!content) throw error(400, 'candidate has no lyrics content');

	await writeLrc(body.path, content);

	const [tags, fileStat] = await Promise.all([readTrackTags(body.path), stat(body.path)]);

	deps.db.upsert({
		path: body.path,
		mtimeMs: fileStat.mtimeMs,
		artist: tags?.artist ?? null,
		title: tags?.title ?? null,
		album: tags?.album ?? null,
		durationSec: tags?.durationSec ?? null,
		status: body.syncedLyrics ? 'synced' : 'plain',
		wroteLrc: true,
		manualOverride: true,
		checkedAt: Date.now()
	});

	return json({ ok: true });
};
