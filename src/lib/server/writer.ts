import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

export function lrcPathFor(trackPath: string): string {
	const ext = extname(trackPath);
	return trackPath.slice(0, trackPath.length - ext.length) + '.lrc';
}

export function lrcExists(trackPath: string): boolean {
	return existsSync(lrcPathFor(trackPath));
}

export async function writeLrc(trackPath: string, content: string): Promise<void> {
	await writeFile(lrcPathFor(trackPath), content, 'utf8');
}

export async function deleteLrc(trackPath: string): Promise<void> {
	await rm(lrcPathFor(trackPath), { force: true });
}
