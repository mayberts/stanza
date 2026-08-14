import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { exportOverrides, importOverrides } from '$lib/server/overrides.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const deps = getDeps();
	const data = await exportOverrides(deps);
	const filename = `stanza-overrides-${new Date().toISOString().slice(0, 10)}.json`;
	return json(data, {
		headers: { 'content-disposition': `attachment; filename="${filename}"` }
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const deps = getDeps();
	const body = await request.json().catch(() => null);
	if (!Array.isArray(body?.overrides)) {
		return json({ error: 'Expected an export file with an "overrides" array' }, { status: 400 });
	}
	const result = await importOverrides(deps, body);
	return json(result);
};
