import chokidar from 'chokidar';
import { extname } from 'node:path';
import { AUDIO_EXTENSIONS } from './tags.js';
import { processTrack, removeTrack, type PipelineDeps } from './pipeline.js';
import { runFullScan } from './scan.js';

function isAudioPath(path: string): boolean {
	return AUDIO_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Starts watching for filesystem changes plus a periodic full rescan. Returns a stop function. */
export function startWatching(deps: PipelineDeps): () => Promise<void> {
	const { config, logger } = deps;

	const watcher = chokidar.watch(config.musicDir, {
		ignoreInitial: true,
		usePolling: config.usePolling,
		interval: config.pollIntervalMs,
		// Wait for a copy/download into the library to finish before reading tags.
		awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 }
	});

	watcher
		.on('add', (path) => {
			if (!isAudioPath(path)) return;
			logger.debug(`New track detected: ${path}`);
			processTrack(deps, path).catch((err) => logger.error(`Failed processing ${path}: ${err}`));
		})
		.on('change', (path) => {
			if (!isAudioPath(path)) return;
			logger.debug(`Track modified: ${path}`);
			processTrack(deps, path).catch((err) => logger.error(`Failed processing ${path}: ${err}`));
		})
		.on('unlink', (path) => {
			if (!isAudioPath(path)) return;
			logger.debug(`Track removed: ${path}`);
			removeTrack(deps, path).catch((err) => logger.error(`Failed removing ${path}: ${err}`));
		})
		.on('error', (err) => logger.error(`Watcher error: ${err}`));

	const intervalMs = config.scanIntervalMinutes * 60 * 1000;
	const timer = setInterval(() => {
		logger.debug('Running periodic full rescan');
		runFullScan(deps).catch((err) => logger.error(`Periodic rescan failed: ${err}`));
	}, intervalMs);

	return async () => {
		clearInterval(timer);
		await watcher.close();
	};
}
