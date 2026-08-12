import 'dotenv/config';
import { isLogLevel, type LogLevel } from './logger.js';

export interface Config {
	musicDir: string;
	dbPath: string;
	scanIntervalMinutes: number;
	retryNotFoundAfterHours: number;
	upgradePlainAfterHours: number;
	usePolling: boolean;
	pollIntervalMs: number;
	rateLimitMs: number;
	overwriteExisting: boolean;
	lrclibBaseUrl: string;
	logLevel: LogLevel;
}

function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed)) {
		throw new Error(`${name} must be an integer, got "${raw}"`);
	}
	return parsed;
}

function envBool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (!raw) return fallback;
	return raw.toLowerCase() === 'true' || raw === '1';
}

export function loadConfig(overrides: Partial<Pick<Config, 'musicDir'>> = {}): Config {
	const musicDir = overrides.musicDir ?? process.env.MUSIC_DIR;
	if (!musicDir) {
		throw new Error('MUSIC_DIR is required (set it in .env or pass --dir)');
	}

	const logLevelRaw = process.env.LOG_LEVEL ?? 'info';
	if (!isLogLevel(logLevelRaw)) {
		throw new Error(`LOG_LEVEL must be one of error|warn|info|debug, got "${logLevelRaw}"`);
	}

	return {
		musicDir,
		dbPath: process.env.DB_PATH ?? './stanza.db',
		scanIntervalMinutes: envInt('SCAN_INTERVAL_MINUTES', 60),
		retryNotFoundAfterHours: envInt('RETRY_NOT_FOUND_AFTER_HOURS', 24),
		upgradePlainAfterHours: envInt('UPGRADE_PLAIN_AFTER_HOURS', 168),
		usePolling: envBool('USE_POLLING', false),
		pollIntervalMs: envInt('POLL_INTERVAL_MS', 15_000),
		rateLimitMs: envInt('RATE_LIMIT_MS', 1000),
		overwriteExisting: envBool('OVERWRITE_EXISTING', false),
		lrclibBaseUrl: process.env.LRCLIB_BASE_URL ?? 'https://lrclib.net/api',
		logLevel: logLevelRaw
	};
}
