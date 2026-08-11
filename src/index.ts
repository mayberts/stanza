#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { StanzaDb } from './db.js';
import { Logger } from './logger.js';
import { LrclibClient } from './lrclib.js';
import type { PipelineDeps } from './pipeline.js';
import { RateLimiter } from './rate-limiter.js';
import { runFullScan } from './scan.js';
import { startWatching } from './watcher.js';

function buildDeps(dirOverride?: string): PipelineDeps {
	const config = loadConfig(dirOverride ? { musicDir: dirOverride } : {});
	const logger = new Logger(config.logLevel);
	const db = new StanzaDb(config.dbPath);
	const lrclib = new LrclibClient(config.lrclibBaseUrl);
	const rateLimiter = new RateLimiter(config.rateLimitMs);
	return { config, db, lrclib, logger, rateLimiter };
}

const program = new Command();
program
	.name('stanza')
	.description('Scans a music library and fetches the matching .lrc lyrics file for each track.')
	.version('0.1.0');

program
	.command('scan')
	.description('Scan the music directory once and exit.')
	.option('-d, --dir <path>', 'music directory (overrides MUSIC_DIR)')
	.action(async (opts: { dir?: string }) => {
		const deps = buildDeps(opts.dir);
		deps.logger.info(`Scanning ${deps.config.musicDir}`);
		await runFullScan(deps);
		deps.db.close();
	});

program
	.command('watch')
	.description('Scan once, then watch for changes and keep running.')
	.option('-d, --dir <path>', 'music directory (overrides MUSIC_DIR)')
	.action(async (opts: { dir?: string }) => {
		const deps = buildDeps(opts.dir);
		deps.logger.info(`Watching ${deps.config.musicDir}`);
		await runFullScan(deps);
		const stop = startWatching(deps);

		const shutdown = async () => {
			deps.logger.info('Shutting down');
			await stop();
			deps.db.close();
			process.exit(0);
		};
		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
	});

await program.parseAsync(process.argv);
