import type { Config } from './config.js';
import type { StanzaDb } from './db.js';
import { isLogLevel } from './logger.js';

/**
 * Config fields exposed on the dashboard's Settings page. Deliberately
 * excludes musicDir/dbPath (filesystem paths fixed at container start),
 * lrclibBaseUrl (a rare self-hosted-mirror override), and PORT (not even
 * part of Config — read directly by the adapter) — none of those can be
 * hot-swapped without restarting the whole process, so they stay env-only.
 */
export type RuntimeSettingKey =
	| 'scanIntervalMinutes'
	| 'retryNotFoundAfterHours'
	| 'upgradePlainAfterHours'
	| 'rateLimitMs'
	| 'overwriteExisting'
	| 'logLevel'
	| 'usePolling'
	| 'pollIntervalMs';

interface BaseDef {
	key: RuntimeSettingKey;
	label: string;
	description: string;
	/** Baked into chokidar/the rescan timer at watch-start — changing it only
	 * takes effect once the watcher is stopped and restarted. */
	restartsWatcher?: boolean;
}
interface IntDef extends BaseDef {
	type: 'int';
	min: number;
}
interface BoolDef extends BaseDef {
	type: 'bool';
}
interface EnumDef extends BaseDef {
	type: 'enum';
	values: readonly string[];
}
export type RuntimeSettingDef = IntDef | BoolDef | EnumDef;

export const RUNTIME_SETTINGS: readonly RuntimeSettingDef[] = [
	{
		key: 'scanIntervalMinutes',
		type: 'int',
		min: 1,
		label: 'Full rescan interval (minutes)',
		description:
			'How often to run a full library rescan as a safety net. Watch mode still reacts to filesystem events immediately regardless of this.',
		restartsWatcher: true
	},
	{
		key: 'retryNotFoundAfterHours',
		type: 'int',
		min: 1,
		label: 'Retry not-found tracks after (hours)',
		description: 'How long to wait before asking LRCLIB again for a track it had no match for.'
	},
	{
		key: 'upgradePlainAfterHours',
		type: 'int',
		min: 1,
		label: 'Recheck plain lyrics for a synced upgrade after (hours)',
		description:
			'How long to wait before rechecking a track that only has plain (unsynced) lyrics, in case LRCLIB has since added synced timing.'
	},
	{
		key: 'rateLimitMs',
		type: 'int',
		min: 0,
		label: 'Minimum delay between LRCLIB requests (ms)',
		description: 'Be a good API citizen — minimum gap between requests to LRCLIB.'
	},
	{
		key: 'overwriteExisting',
		type: 'bool',
		label: 'Overwrite existing .lrc files',
		description:
			"Allow Stanza to overwrite .lrc files that already exist but weren't written by Stanza itself. Leave off to never touch lyrics you (or another tool) already placed there."
	},
	{
		key: 'logLevel',
		type: 'enum',
		values: ['error', 'warn', 'info', 'debug'],
		label: 'Log level',
		description: 'Verbosity of server logs.'
	},
	{
		key: 'usePolling',
		type: 'bool',
		label: 'Use polling for filesystem watching',
		description:
			"Turn on if the music directory is a network share (NFS/SMB) where native filesystem events (inotify) don't fire.",
		restartsWatcher: true
	},
	{
		key: 'pollIntervalMs',
		type: 'int',
		min: 100,
		label: 'Polling interval (ms)',
		description: 'How often to poll for changes — only used when polling is on.',
		restartsWatcher: true
	}
];

export function findRuntimeSetting(key: string): RuntimeSettingDef | undefined {
	return RUNTIME_SETTINGS.find((d) => d.key === key);
}

/** Parses and validates a raw string (from the DB or a form submission) into
 * the value that belongs in Config[def.key]. Throws a message-worthy error
 * on invalid input rather than silently coercing something wrong. */
export function parseSettingValue(def: RuntimeSettingDef, raw: string): number | boolean | string {
	if (def.type === 'int') {
		const n = Number.parseInt(raw, 10);
		if (Number.isNaN(n) || n < def.min) {
			throw new Error(`${def.label} must be a whole number >= ${def.min}`);
		}
		return n;
	}
	if (def.type === 'bool') {
		if (raw !== 'true' && raw !== 'false') {
			throw new Error(`${def.label} must be true or false`);
		}
		return raw === 'true';
	}
	if (!def.values.includes(raw)) {
		throw new Error(`${def.label} must be one of ${def.values.join(', ')}`);
	}
	if (def.key === 'logLevel' && !isLogLevel(raw)) {
		throw new Error(`${def.label} must be one of ${def.values.join(', ')}`);
	}
	return raw;
}

export function serializeSettingValue(value: number | boolean | string): string {
	return String(value);
}

/** Applies any DB-persisted overrides onto a freshly env-loaded Config, in
 * place. A setting never saved from the UI leaves the env-derived default
 * untouched, so plain env-var deployments keep working exactly as before. */
export function loadPersistedSettings(db: StanzaDb, config: Config): void {
	const target = config as unknown as Record<string, unknown>;
	for (const def of RUNTIME_SETTINGS) {
		const raw = db.getSetting(def.key);
		if (raw === undefined) continue;
		try {
			target[def.key] = parseSettingValue(def, raw);
		} catch {
			// A stale or hand-edited DB value shouldn't crash the whole app —
			// just keep the env-derived default for this one setting.
		}
	}
}
