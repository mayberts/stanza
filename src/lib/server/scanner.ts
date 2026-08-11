import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { AUDIO_EXTENSIONS } from './tags.js';

export async function* walkAudioFiles(dir: string): AsyncGenerator<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkAudioFiles(full);
		} else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
			yield full;
		}
	}
}
