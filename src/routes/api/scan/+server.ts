import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { triggerScan } from '$lib/server/scan-runner.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	const deps = getDeps();
	const body = await request.json().catch(() => ({}));
	const force = Boolean((body as { force?: boolean })?.force);
	return json(triggerScan(deps, { force }));
};
