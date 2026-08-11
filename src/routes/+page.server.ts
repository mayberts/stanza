import { getDeps } from '$lib/server/deps.js';
import { isScanning } from '$lib/server/scan-runner.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = () => {
	const deps = getDeps();
	const { rows, total } = deps.db.list({ limit: 50, offset: 0 });
	return {
		musicDir: deps.config.musicDir,
		counts: deps.db.statsCounts(),
		scanning: isScanning(),
		tracks: rows,
		total
	};
};
