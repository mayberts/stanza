# Stanza

Scans a music library and fetches the matching `.lrc` lyrics file for each
track — synced (timestamped) lyrics when available, plain text as a
fallback — from [LRCLIB](https://lrclib.net). Ships as a small SvelteKit app:
one process watches your library in the background and serves a dashboard
where you can see match status and fix the ones it got wrong.

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
Tracks that only got plain (unsynced) lyrics are rechecked less often, after
`UPGRADE_PLAIN_AFTER_HOURS`, in case LRCLIB adds synced timing for them
later — synced always replaces plain, never the other way around. `.lrc`
files that already exist and weren't written by Stanza itself are left
alone by default.

**Rescan now** (dashboard button, or `stanza scan --force`) skips both
cooldowns and rechecks every not-found/error/plain track immediately,
regardless of how recently it was last checked. The automatic background
rescan does not — it always respects the cooldowns, so it won't hammer
LRCLIB on every scan for tracks that genuinely aren't there yet.

## Dashboard

The web app (running by default, see below) serves a dashboard at `/`:

- Live counts per match status (synced / plain / not found / existing lyrics
  left alone / no tags / error), click one to filter the track list.
- Search by artist, title, album, or file path.
- **Rescan now** to trigger a full scan on demand.
- **Rescan filtered** rechecks only the tracks currently matching your filter,
  instead of the whole library. If that filter is specifically the "Existing
  lyrics" status, this is the one case where Stanza _will_ overwrite lyrics it
  didn't write — filtering to exactly that bucket and asking for a rescan only
  makes sense as "try to actually fix these" (confirmed before it runs). Any
  other filter combination still leaves those files alone.
- **Fix match** on any track opens a panel to search LRCLIB yourself (with
  the artist/title/album prefilled, editable) and pick the right result —
  for tracks Stanza got wrong or couldn't find automatically.
- **Review queue** turns "Fix match" into a bulk workflow: filter to whatever
  needs attention (e.g. the "Not found" status) and click **Review queue** to
  step through every matching track — up to 200 at a time — one after
  another, in the same panel, without reopening it per row. Applying a match
  or skipping a track (the → button, or clicking outside the panel) both
  advance to the next one; **Exit queue** stops at any point. Tracks already
  protected by a manual override are skipped automatically since they don't
  need another look.
- **Export overrides** / **Import overrides** back up and restore every
  manually-matched track (picked via "Fix match" or "Contribute lyrics") as a
  single JSON file, including each one's `.lrc` content — not just a pointer
  to it. The manual/protected flag itself only lives in the state DB, so a
  lost or rebuilt DB (a fresh `/config` volume, a `stanza.db` deleted to force
  a clean rescan, moving to a new host) would otherwise silently drop that
  protection, leaving your hand-picked matches exposed to being overwritten
  by a later automatic rescan. Importing restores the protected flag for any
  track whose `.lrc` still matches the backup exactly, rewrites the `.lrc`
  file if it went missing too, and leaves any track alone whose `.lrc` has
  since diverged locally (never silently overwrites a real match already
  present).

## Usage

```sh
npm install
cp .env.example .env   # set MUSIC_DIR at minimum
npm run dev             # dashboard + watcher, http://localhost:5173
```

For production:

```sh
npm run build
node build               # dashboard + watcher, http://localhost:3000 (set PORT to change)
```

The watcher starts automatically the moment the server boots (see
`src/hooks.server.ts`) — there's no separate "start watching" step.

### Headless CLI (no dashboard)

For local/dev one-off scans without the web server:

```sh
npm run cli -- scan --dir /path/to/music    # scan once and exit
npm run cli -- watch --dir /path/to/music   # watch, no dashboard
```

This isn't included in the Docker image — in Docker, trigger a one-off scan
by hitting the dashboard's "Rescan now" button, or `curl -X POST
http://<host>:<port>/api/scan` from a script/cron if you want one without
opening the UI.

## Development

```sh
npm run check   # type-check
npm run lint    # prettier --check + eslint
npm run test    # vitest, once
npm run test:watch
```

Tests cover the server-side logic that's easy to regress silently: the
LRCLIB matching/ranking and feat.-/remaster-stripping in `lrclib.ts`, the
rescan-cooldown decisions in `pipeline.ts`, filename-fallback tag parsing,
the override export/import round-trip, and the DB layer. CI (see
`.github/workflows/ci.yml`) runs all of the above plus a production build on
every push and pull request.

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
container recreation. The dashboard is served on port 3000 inside the
container — see `docker-compose.yml` for the host port mapping and volume
paths.

## Attribution

Lyrics are sourced from [LRCLIB](https://lrclib.net), a free and open
lyrics database. Please consider [contributing back](https://lrclib.net)
lyrics you have that LRCLIB is missing.
