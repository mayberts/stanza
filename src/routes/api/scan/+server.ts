import { json } from '@sveltejs/kit';
import type { TrackFilter } from '$lib/server/db.js';
import { getDeps } from '$lib/server/deps.js';
import { triggerScan } from '$lib/server/scan-runner.js';
import type { RequestHandler } from './$types.js';

interface ScanBody {
	force?: boolean;
	filter?: TrackFilter;
}

export const POST: RequestHandler = async ({ request }) => {
	const deps = getDeps();
	const body = ((await request.json().catch(() => ({}))) ?? {}) as ScanBody;
	return json(triggerScan(deps, { force: Boolean(body.force), filter: body.filter }));
};
