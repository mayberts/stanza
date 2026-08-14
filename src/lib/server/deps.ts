import { loadConfig, type Config } from './config.js';
import { StanzaDb } from './db.js';
import { Logger } from './logger.js';
import { LrclibClient } from './lrclib.js';
import type { PipelineDeps } from './pipeline.js';
import { RateLimiter } from './rate-limiter.js';
import { triggerScan } from './scan-runner.js';
import {
	findRuntimeSetting,
	loadPersistedSettings,
	parseSettingValue,
	serializeSettingValue,
	type RuntimeSettingKey
} from './settings.js';
import { startWatching } from './watcher.js';

// Guarded on globalThis so this survives Vite dev-server module reloads
// without opening a second DB connection or a second chokidar watcher.
declare global {
	var __stanzaDeps: PipelineDeps | undefined;
	var __stanzaShutdownRegistered: boolean | undefined;
	var __stanzaWatcherStop: (() => Promise<void>) | undefined;
}

export function getDeps(): PipelineDeps {
	if (!globalThis.__stanzaDeps) {
		const config = loadConfig();
		const db = new StanzaDb(config.dbPath);
		loadPersistedSettings(db, config);
		const logger = new Logger(config.logLevel);
		const lrclib = new LrclibClient(config.lrclibBaseUrl);
		const rateLimiter = new RateLimiter(config.rateLimitMs);
		globalThis.__stanzaDeps = { config, db, lrclib, logger, rateLimiter };
	}
	return globalThis.__stanzaDeps;
}

export function ensureWatcherStarted(): void {
	if (globalThis.__stanzaShutdownRegistered) return;
	globalThis.__stanzaShutdownRegistered = true;

	const deps = getDeps();
	deps.logger.info(`Starting watcher on ${deps.config.musicDir}`);
	globalThis.__stanzaWatcherStop = startWatching(deps);
	triggerScan(deps);

	const shutdown = async () => {
		deps.logger.info('Shutting down');
		await globalThis.__stanzaWatcherStop?.();
		deps.db.close();
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

/** Stops and restarts the filesystem watcher so settings baked in at
 * watch-start (polling mode/interval, rescan cadence) pick up a change
 * without needing a full process restart. */
async function restartWatcher(): Promise<void> {
	const deps = getDeps();
	if (globalThis.__stanzaWatcherStop) {
		await globalThis.__stanzaWatcherStop();
	}
	deps.logger.info('Restarting watcher to apply updated settings');
	globalThis.__stanzaWatcherStop = startWatching(deps);
}

/** Validates, persists, and live-applies a single Settings-page change —
 * the DB row, the in-memory Config every request reads from, and (for the
 * couple of settings that a live-reading Config alone doesn't reach) the
 * Logger/RateLimiter instances or the watcher itself. */
export async function applyRuntimeSetting(key: RuntimeSettingKey, rawValue: string): Promise<void> {
	const def = findRuntimeSetting(key);
	if (!def) throw new Error(`Unknown setting: ${key}`);
	const value = parseSettingValue(def, rawValue);

	const deps = getDeps();
	deps.db.setSetting(key, serializeSettingValue(value));
	(deps.config as unknown as Record<string, unknown>)[key] = value;

	if (key === 'logLevel') deps.logger.setLevel(value as Config['logLevel']);
	if (key === 'rateLimitMs') deps.rateLimiter.setMinIntervalMs(value as number);
	if (def.restartsWatcher) await restartWatcher();
}
