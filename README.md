# Stanza

Scans a music library and fetches the matching `.lrc` lyrics file for each
track — synced (timestamped) lyrics when available, plain text as a
fallback — from [LRCLIB](https://lrclib.net).

Tracks are matched by their own embedded tags (artist, title, album,
duration) — no external library database required. Matched lyrics are
written as `<track-basename>.lrc` next to each audio file, which is picked
up automatically by most players (Plex, Jellyfin, foobar2000, etc).

## How matching works

For each track, Stanza reads artist/title/album/duration from the file's
tags and asks LRCLIB for an exact match (`/api/get`, matched on duration).
If that misses, it falls back to `/api/search` and picks the closest
duration match within a few seconds, preferring a synced result over a
plain one. Tracks with no usable artist/title tags are skipped and logged.

A local SQLite DB tracks what's already been checked, so rescans are cheap:
unchanged tracks with a resolved lyrics status aren't re-queried. Tracks
LRCLIB had no match for are retried automatically after
`RETRY_NOT_FOUND_AFTER_HOURS`, since LRCLIB's database grows over time.
`.lrc` files that already exist and weren't written by Stanza itself are
left alone by default.

## Usage

```sh
npm install
cp .env.example .env   # set MUSIC_DIR at minimum
npm run build

npm start scan    # one-off scan, exits when done
npm start watch    # scan once, then watch for changes and keep running
```

During development, `npm run dev -- scan` / `npm run dev -- watch` runs
straight from TypeScript via `tsx`.

## Configuration

All configuration is via environment variables — see `.env.example` for the
full list and defaults. The only required one is `MUSIC_DIR`.

Watch mode reacts to filesystem events (new/changed/removed tracks)
immediately, plus a periodic full rescan (`SCAN_INTERVAL_MINUTES`) as a
safety net for events a watcher can miss — notably on network shares, where
`USE_POLLING=true` is usually also needed since inotify doesn't fire over
NFS/SMB.

## Docker

```sh
cp .env.example .env
docker compose up -d --build
```

Mount your actual music library over `/music` (read-write, so `.lrc` files
can be written) and a `/config` volume for the state DB to persist across
container recreation. See `docker-compose.yml`.

## Attribution

Lyrics are sourced from [LRCLIB](https://lrclib.net), a free and open
lyrics database. Please consider [contributing back](https://lrclib.net)
lyrics you have that LRCLIB is missing.
