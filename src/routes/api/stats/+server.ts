import { json } from '@sveltejs/kit';
import { getDeps } from '$lib/server/deps.js';
import { isScanning } from '$lib/server/scan-runner.js';

export function GET() {
	const deps = getDeps();
	return json({
		musicDir: deps.config.musicDir,
		counts: deps.db.statsCounts(),
		scanning: isScanning()
	});
}
