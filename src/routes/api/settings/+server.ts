import { error, json } from '@sveltejs/kit';
import { applyRuntimeSetting, getDeps } from '$lib/server/deps.js';
import { RUNTIME_SETTINGS, type RuntimeSettingKey } from '$lib/server/settings.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = () => {
	const deps = getDeps();
	const config = deps.config as unknown as Record<string, unknown>;
	const settings = RUNTIME_SETTINGS.map((def) => ({ ...def, value: config[def.key] }));
	return json({ settings });
};

interface SettingsBody {
	key?: string;
	value?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = ((await request.json().catch(() => null)) ?? null) as SettingsBody | null;
	if (!body?.key || body.value === undefined) throw error(400, 'key and value are required');
	if (!RUNTIME_SETTINGS.some((d) => d.key === body.key)) {
		throw error(400, `Unknown setting: ${body.key}`);
	}

	try {
		await applyRuntimeSetting(body.key as RuntimeSettingKey, String(body.value));
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : String(err));
	}

	return json({ ok: true });
};
