import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { triggerScan } from '$lib/server/scan-runner.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = () => {
	const deps = getDeps();
	return json(triggerScan(deps));
};
