import { getDeps } from '$lib/server/deps.js';
import { RUNTIME_SETTINGS } from '$lib/server/settings.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = () => {
	const deps = getDeps();
	const config = deps.config as unknown as Record<string, unknown>;
	return {
		settings: RUNTIME_SETTINGS.map((def) => ({ ...def, value: config[def.key] })),
		musicDir: deps.config.musicDir,
		dbPath: deps.config.dbPath,
		lrclibBaseUrl: deps.config.lrclibBaseUrl
	};
};
