#!/usr/bin/env node
// Headless CLI, mainly for local/dev use without the web dashboard (`npm run
// cli -- scan|watch`). The production Docker image runs the SvelteKit app
// instead (`node build`), which does the same watching plus serves the UI.
import { Command } from 'commander';
import { loadConfig } from './lib/server/config.js';
import { StanzaDb } from './lib/server/db.js';
import { Logger } from './lib/server/logger.js';
import { LrclibClient } from './lib/server/lrclib.js';
import type { PipelineDeps } from './lib/server/pipeline.js';
import { RateLimiter } from './lib/server/rate-limiter.js';
import { runFullScan } from './lib/server/scan.js';
import { startWatching } from './lib/server/watcher.js';

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
	.version('0.2.0');

program
	.command('scan')
	.description('Scan the music directory once and exit.')
	.option('-d, --dir <path>', 'music directory (overrides MUSIC_DIR)')
	.option('-f, --force', 'ignore the not-found/error/plain retry cooldowns and recheck them now')
	.action(async (opts: { dir?: string; force?: boolean }) => {
		const deps = buildDeps(opts.dir);
		deps.logger.info(`Scanning ${deps.config.musicDir}`);
		await runFullScan(deps, { force: opts.force });
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
