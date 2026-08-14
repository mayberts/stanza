import { describe, expect, it } from 'vitest';
import type { Config } from './config.js';
import { StanzaDb } from './db.js';
import {
	findRuntimeSetting,
	loadPersistedSettings,
	parseSettingValue,
	RUNTIME_SETTINGS,
	serializeSettingValue
} from './settings.js';

function baseConfig(): Config {
	return {
		musicDir: '/music',
		dbPath: ':memory:',
		scanIntervalMinutes: 60,
		retryNotFoundAfterHours: 24,
		upgradePlainAfterHours: 168,
		usePolling: false,
		pollIntervalMs: 15_000,
		rateLimitMs: 1000,
		overwriteExisting: false,
		lrclibBaseUrl: 'https://lrclib.net/api',
		logLevel: 'info'
	};
}

describe('parseSettingValue', () => {
	it('parses a valid int and rejects below the minimum', () => {
		const def = findRuntimeSetting('scanIntervalMinutes')!;
		expect(parseSettingValue(def, '30')).toBe(30);
		expect(() => parseSettingValue(def, '0')).toThrow(/>= 1/);
		expect(() => parseSettingValue(def, 'abc')).toThrow();
	});

	it('parses a valid bool and rejects anything else', () => {
		const def = findRuntimeSetting('overwriteExisting')!;
		expect(parseSettingValue(def, 'true')).toBe(true);
		expect(parseSettingValue(def, 'false')).toBe(false);
		expect(() => parseSettingValue(def, 'yes')).toThrow(/true or false/);
	});

	it('parses a valid enum value and rejects anything outside it', () => {
		const def = findRuntimeSetting('logLevel')!;
		expect(parseSettingValue(def, 'debug')).toBe('debug');
		expect(() => parseSettingValue(def, 'verbose')).toThrow(/must be one of/);
	});
});

describe('serializeSettingValue', () => {
	it('round-trips through parse for every def', () => {
		for (const def of RUNTIME_SETTINGS) {
			const sample = def.type === 'int' ? def.min : def.type === 'bool' ? true : def.values[0];
			const serialized = serializeSettingValue(sample);
			expect(parseSettingValue(def, serialized)).toBe(sample);
		}
	});
});

describe('loadPersistedSettings', () => {
	it('leaves the env-derived config untouched when nothing was ever saved', () => {
		const db = new StanzaDb(':memory:');
		const config = baseConfig();

		loadPersistedSettings(db, config);

		expect(config).toEqual(baseConfig());
	});

	it('overrides only the fields that were saved, leaving the rest at their env default', () => {
		const db = new StanzaDb(':memory:');
		db.setSetting('scanIntervalMinutes', '15');
		db.setSetting('overwriteExisting', 'true');
		const config = baseConfig();

		loadPersistedSettings(db, config);

		expect(config.scanIntervalMinutes).toBe(15);
		expect(config.overwriteExisting).toBe(true);
		expect(config.retryNotFoundAfterHours).toBe(24); // untouched
	});

	it('falls back to the env default for a stale/invalid stored value instead of throwing', () => {
		const db = new StanzaDb(':memory:');
		db.setSetting('logLevel', 'not-a-real-level');
		const config = baseConfig();

		expect(() => loadPersistedSettings(db, config)).not.toThrow();
		expect(config.logLevel).toBe('info');
	});
});
