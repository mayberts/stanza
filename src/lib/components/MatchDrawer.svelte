<script lang="ts">
	import { formatDuration, trackFileName, type LrclibRecord, type TrackRow } from '$lib/types.js';

	let {
		track,
		onClose,
		onApplied,
		onContribute
	}: {
		track: TrackRow;
		onClose: () => void;
		onApplied: () => void;
		onContribute: () => void;
	} = $props();

	let searchArtist = $state(track.artist ?? '');
	let searchTitle = $state(track.title ?? '');
	let searchAlbum = $state(track.album ?? '');
	let candidates = $state<LrclibRecord[] | null>(null);
	let loading = $state(false);
	let applyingId = $state<number | null>(null);
	let errorMsg = $state<string | null>(null);

	function lyricsPreview(record: LrclibRecord): string {
		const text = record.syncedLyrics ?? record.plainLyrics ?? '';
		return text
			.split('\n')
			.map((line) => line.replace(/^\[\d{2}:\d{2}\.\d{2,3}]\s*/, ''))
			.filter((line) => line.trim().length > 0)
			.slice(0, 2)
			.join(' / ');
	}

	async function search() {
		loading = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: track.path,
					query: { artist: searchArtist, title: searchTitle, album: searchAlbum || undefined }
				})
			});
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? res.statusText);
			const data = await res.json();
			candidates = data.candidates;
		} catch (err) {
			errorMsg = String(err instanceof Error ? err.message : err);
			candidates = [];
		} finally {
			loading = false;
		}
	}

	async function apply(candidate: LrclibRecord) {
		applyingId = candidate.id;
		errorMsg = null;
		try {
			const res = await fetch('/api/apply', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: track.path,
					syncedLyrics: candidate.syncedLyrics,
					plainLyrics: candidate.plainLyrics
				})
			});
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? res.statusText);
			onApplied();
			onClose();
		} catch (err) {
			errorMsg = String(err instanceof Error ? err.message : err);
		} finally {
			applyingId = null;
		}
	}

	search();
</script>

<div class="overlay" onclick={onClose} role="presentation"></div>
<aside class="drawer">
	<header>
		<div>
			<h2>Fix lyrics match</h2>
			<p class="path">{trackFileName(track.path)}</p>
		</div>
		<button class="icon-btn" onclick={onClose} aria-label="Close">✕</button>
	</header>

	<form
		class="query"
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
	>
		<label>
			Artist
			<input bind:value={searchArtist} />
		</label>
		<label>
			Title
			<input bind:value={searchTitle} />
		</label>
		<label>
			Album <span class="muted">(optional)</span>
			<input bind:value={searchAlbum} />
		</label>
		<button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search LRCLIB'}</button>
	</form>

	{#if errorMsg}
		<p class="error">{errorMsg}</p>
	{/if}

	<div class="results">
		{#if loading}
			<p class="muted">Searching…</p>
		{:else if candidates && candidates.length === 0}
			<p class="muted">No results. Try adjusting the artist/title above.</p>
		{:else if candidates}
			{#each candidates as candidate (candidate.id)}
				<div class="candidate">
					<div class="candidate-main">
						<strong>{candidate.artistName} — {candidate.trackName}</strong>
						<span class="muted">
							{candidate.albumName ?? 'Unknown album'} · {formatDuration(candidate.duration)}
						</span>
						{#if candidate.instrumental}
							<span class="status-badge status-skipped_existing">Instrumental</span>
						{:else if candidate.syncedLyrics}
							<span class="status-badge status-synced">Synced</span>
						{:else if candidate.plainLyrics}
							<span class="status-badge status-plain">Plain</span>
						{:else}
							<span class="status-badge status-no_tags">No lyrics</span>
						{/if}
						{#if candidate.syncedLyrics || candidate.plainLyrics}
							<p class="preview">{lyricsPreview(candidate)}</p>
						{/if}
					</div>
					<button
						disabled={applyingId !== null || (!candidate.syncedLyrics && !candidate.plainLyrics)}
						onclick={() => apply(candidate)}
					>
						{applyingId === candidate.id ? 'Applying…' : 'Use this'}
					</button>
				</div>
			{/each}
		{/if}
	</div>

	<div class="contribute">
		<p class="muted">Not seeing it, or LRCLIB doesn't have it yet?</p>
		<button class="link-btn" onclick={onContribute}>Contribute lyrics to LRCLIB →</button>
	</div>
</aside>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 50%);
		z-index: 10;
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(480px, 100vw);
		background: var(--surface);
		border-left: 1px solid var(--border);
		z-index: 11;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.path {
		margin: 0.25rem 0 0;
		color: var(--muted);
		font-size: 0.8rem;
		word-break: break-all;
	}
	.icon-btn {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1rem;
	}
	.query {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.query label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.query input {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.5rem;
		color: var(--text);
	}
	.query button {
		margin-top: 0.25rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 6px;
		padding: 0.55rem;
		font-weight: 600;
	}
	.query button:disabled {
		opacity: 0.6;
	}
	.results {
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.candidate {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}
	.candidate-main {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	.preview {
		margin: 0.2rem 0 0;
		color: var(--muted);
		font-size: 0.78rem;
		font-style: italic;
	}
	.candidate button {
		flex-shrink: 0;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
	}
	.candidate button:disabled {
		opacity: 0.5;
	}
	.muted {
		color: var(--muted);
	}
	.error {
		margin: 0 1.25rem;
		color: var(--status-error);
		font-size: 0.85rem;
	}
	.contribute {
		margin-top: auto;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.contribute .muted {
		font-size: 0.8rem;
	}
	.contribute .link-btn {
		align-self: flex-start;
		background: none;
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
	}
</style>
