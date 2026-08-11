import { loadConfig } from './config.js';
import { StanzaDb } from './db.js';
import { Logger } from './logger.js';
import { LrclibClient } from './lrclib.js';
import type { PipelineDeps } from './pipeline.js';
import { RateLimiter } from './rate-limiter.js';
import { triggerScan } from './scan-runner.js';
import { startWatching } from './watcher.js';

// Guarded on globalThis so this survives Vite dev-server module reloads
// without opening a second DB connection or a second chokidar watcher.
declare global {
	var __stanzaDeps: PipelineDeps | undefined;
	var __stanzaWatcherStarted: boolean | undefined;
}

export function getDeps(): PipelineDeps {
	if (!globalThis.__stanzaDeps) {
		const config = loadConfig();
		const logger = new Logger(config.logLevel);
		const db = new StanzaDb(config.dbPath);
		const lrclib = new LrclibClient(config.lrclibBaseUrl);
		const rateLimiter = new RateLimiter(config.rateLimitMs);
		globalThis.__stanzaDeps = { config, db, lrclib, logger, rateLimiter };
	}
	return globalThis.__stanzaDeps;
}

export function ensureWatcherStarted(): void {
	if (globalThis.__stanzaWatcherStarted) return;
	globalThis.__stanzaWatcherStarted = true;

	const deps = getDeps();
	deps.logger.info(`Starting watcher on ${deps.config.musicDir}`);
	const stopWatching = startWatching(deps);
	triggerScan(deps);

	const shutdown = async () => {
		deps.logger.info('Shutting down');
		await stopWatching();
		deps.db.close();
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}
