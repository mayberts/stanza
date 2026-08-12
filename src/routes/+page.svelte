<script lang="ts">
	import MatchDrawer from '$lib/components/MatchDrawer.svelte';
	import {
		ALL_STATUSES,
		STATUS_LABELS,
		formatDuration,
		trackFileName,
		type TrackRow,
		type TrackStatus
	} from '$lib/types.js';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	const LIMIT = 50;

	let tracks = $state<TrackRow[]>(data.tracks);
	let total = $state(data.total);
	let counts = $state(data.counts);
	let scanning = $state(data.scanning);
	let musicDir = data.musicDir;
	let artists = $state<string[]>(data.artists);
	let albums = $state<string[]>(data.albums);

	let statusFilter = $state<TrackStatus | null>(null);
	let artistFilter = $state<string | null>(null);
	let albumFilter = $state<string | null>(null);
	let titleInput = $state('');
	let titleQuery = $state('');
	let offset = $state(0);
	let selectedTrack = $state<TrackRow | null>(null);

	let titleDebounce: ReturnType<typeof setTimeout>;
	function onTitleInput() {
		clearTimeout(titleDebounce);
		titleDebounce = setTimeout(() => {
			titleQuery = titleInput;
			offset = 0;
		}, 300);
	}

	function selectStatus(status: TrackStatus | null) {
		statusFilter = status;
		offset = 0;
	}

	async function refreshAlbums(artist: string | null) {
		const params = new SvelteURLSearchParams();
		if (artist) params.set('artist', artist);
		const res = await fetch(`/api/albums?${params}`);
		albums = (await res.json()).albums;
	}

	function onArtistChange(value: string) {
		artistFilter = value || null;
		albumFilter = null;
		offset = 0;
		refreshAlbums(artistFilter);
	}

	function onAlbumChange(value: string) {
		albumFilter = value || null;
		offset = 0;
	}

	async function refreshStats() {
		const res = await fetch('/api/stats');
		const data = await res.json();
		counts = data.counts;
		scanning = data.scanning;
	}

	async function refreshTracks(
		status: TrackStatus | null,
		artist: string | null,
		album: string | null,
		title: string,
		off: number
	) {
		const params = new SvelteURLSearchParams();
		if (status) params.set('status', status);
		if (artist) params.set('artist', artist);
		if (album) params.set('album', album);
		if (title) params.set('title', title);
		params.set('limit', String(LIMIT));
		params.set('offset', String(off));
		const res = await fetch(`/api/tracks?${params}`);
		const data = await res.json();
		tracks = data.rows;
		total = data.total;
	}

	async function refreshFacets() {
		const res = await fetch('/api/artists');
		artists = (await res.json()).artists;
	}

	async function rescan() {
		scanning = true;
		await fetch('/api/scan', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ force: true })
		});
	}

	$effect(() => {
		refreshTracks(statusFilter, artistFilter, albumFilter, titleQuery, offset);
	});

	$effect(() => {
		const interval = setInterval(() => {
			refreshStats();
			refreshTracks(statusFilter, artistFilter, albumFilter, titleQuery, offset);
			refreshFacets();
		}, 4000);
		return () => clearInterval(interval);
	});

	function onApplied() {
		refreshStats();
		refreshTracks(statusFilter, artistFilter, albumFilter, titleQuery, offset);
	}

	const totalTracks = $derived(Object.values(counts).reduce((a, b) => a + b, 0));
</script>

<svelte:head>
	<title>Stanza</title>
</svelte:head>

<div class="page">
	<header>
		<div>
			<div class="brand">
				<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
					<rect width="64" height="64" rx="14" fill="#0f1115" />
					<rect x="14" y="16" width="36" height="7" rx="3.5" fill="#8b92a1" opacity="0.55" />
					<rect x="9" y="29" width="46" height="9" rx="4.5" fill="#f5b942" />
					<rect x="17" y="42" width="30" height="7" rx="3.5" fill="#8b92a1" opacity="0.55" />
				</svg>
				<h1>Stanza</h1>
			</div>
			<p class="muted">{musicDir}</p>
		</div>
		<div class="header-actions">
			{#if scanning}
				<span class="scanning">
					<span class="dot"></span> Scanning…
				</span>
			{/if}
			<button onclick={rescan} disabled={scanning}>Rescan now</button>
		</div>
	</header>

	<div class="stats">
		<button class="pill" class:active={statusFilter === null} onclick={() => selectStatus(null)}>
			All <span class="count">{totalTracks}</span>
		</button>
		{#each ALL_STATUSES as status (status)}
			<button
				class="pill status-{status}"
				class:active={statusFilter === status}
				onclick={() => selectStatus(status)}
			>
				{STATUS_LABELS[status]} <span class="count">{counts[status] ?? 0}</span>
			</button>
		{/each}
	</div>

	<div class="toolbar">
		<select
			class="filter-select"
			value={artistFilter ?? ''}
			onchange={(e) => onArtistChange(e.currentTarget.value)}
		>
			<option value="">All artists</option>
			{#each artists as artist (artist)}
				<option value={artist}>{artist}</option>
			{/each}
		</select>
		<select
			class="filter-select"
			value={albumFilter ?? ''}
			onchange={(e) => onAlbumChange(e.currentTarget.value)}
		>
			<option value="">All albums</option>
			{#each albums as album (album)}
				<option value={album}>{album}</option>
			{/each}
		</select>
		<input
			class="search"
			placeholder="Search track title…"
			bind:value={titleInput}
			oninput={onTitleInput}
		/>
	</div>

	<table>
		<thead>
			<tr>
				<th>Artist</th>
				<th>Title</th>
				<th>Album</th>
				<th>Duration</th>
				<th>Status</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each tracks as track (track.path)}
				<tr>
					<td>{track.artist ?? '—'}</td>
					<td>
						{track.title ?? trackFileName(track.path)}
						<div class="file-path">{trackFileName(track.path)}</div>
					</td>
					<td>{track.album ?? '—'}</td>
					<td>{formatDuration(track.durationSec)}</td>
					<td
						><span class="status-badge status-{track.status}">{STATUS_LABELS[track.status]}</span
						></td
					>
					<td class="actions">
						<button class="link-btn" onclick={() => (selectedTrack = track)}>Fix match</button>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="muted empty">No tracks match this filter yet.</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="pagination">
		<span class="muted">
			{total === 0 ? 0 : offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
		</span>
		<div>
			<button disabled={offset === 0} onclick={() => (offset = Math.max(0, offset - LIMIT))}>
				Prev
			</button>
			<button disabled={offset + LIMIT >= total} onclick={() => (offset = offset + LIMIT)}>
				Next
			</button>
		</div>
	</div>
</div>

{#if selectedTrack}
	<MatchDrawer track={selectedTrack} onClose={() => (selectedTrack = null)} {onApplied} />
{/if}

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.mark {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		flex-shrink: 0;
	}
	h1 {
		margin: 0;
		font-size: 1.4rem;
	}
	.muted {
		color: var(--muted);
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	.header-actions button {
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		font-weight: 600;
	}
	.header-actions button:disabled {
		opacity: 0.6;
	}
	.scanning {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		color: var(--status-plain);
		font-size: 0.85rem;
	}
	.dot {
		width: 0.5em;
		height: 0.5em;
		border-radius: 50%;
		background: currentColor;
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}
	.pill {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 999px;
		padding: 0.35rem 0.8rem;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.pill.active {
		border-color: var(--accent);
	}
	.pill .count {
		color: var(--muted);
	}
	.toolbar {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.search,
	.filter-select {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 0.9rem;
		color: var(--text);
	}
	.search {
		flex: 1 1 auto;
		min-width: 0;
	}
	.filter-select {
		flex: 0 1 220px;
		min-width: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	th,
	td {
		text-align: left;
		padding: 0.65rem 0.9rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		vertical-align: top;
	}
	th {
		color: var(--muted);
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	tbody tr:last-child td {
		border-bottom: none;
	}
	.file-path {
		color: var(--muted);
		font-size: 0.72rem;
		margin-top: 0.15rem;
		word-break: break-all;
	}
	.empty {
		text-align: center;
		padding: 2rem;
	}
	.link-btn {
		background: none;
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
		font-size: 0.78rem;
	}
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
		font-size: 0.85rem;
	}
	.pagination button {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.4rem 0.8rem;
		margin-left: 0.5rem;
	}
	.pagination button:disabled {
		opacity: 0.5;
	}
</style>
