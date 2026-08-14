<script lang="ts">
	import { trackFileName, type TrackRow } from '$lib/types.js';

	let {
		track,
		onClose,
		onApplied
	}: {
		track: TrackRow;
		onClose: () => void;
		onApplied: () => void;
	} = $props();

	let artist = $state(track.artist ?? '');
	let title = $state(track.title ?? '');
	let album = $state(track.album ?? '');
	let plainLyrics = $state('');
	let syncedLyrics = $state('');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let result = $state<{ published: boolean; publishError?: string } | null>(null);

	async function submit() {
		submitting = true;
		errorMsg = null;
		result = null;
		try {
			const res = await fetch('/api/publish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: track.path,
					artist,
					title,
					album: album || undefined,
					plainLyrics,
					syncedLyrics: syncedLyrics || undefined
				})
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) throw new Error(data?.message ?? res.statusText);
			result = { published: data.published, publishError: data.publishError };
			onApplied();
		} catch (err) {
			errorMsg = String(err instanceof Error ? err.message : err);
		} finally {
			submitting = false;
		}
	}
</script>

<div class="overlay" onclick={onClose} role="presentation"></div>
<aside class="drawer">
	<header>
		<div>
			<h2>Contribute lyrics to LRCLIB</h2>
			<p class="path">{trackFileName(track.path)}</p>
		</div>
		<button class="icon-btn" onclick={onClose} aria-label="Close">✕</button>
	</header>

	{#if result}
		<div class="result">
			{#if result.published}
				<p class="success">✓ Published to LRCLIB and saved locally.</p>
			{:else}
				<p class="partial">
					✓ Saved locally, but publishing to LRCLIB failed:
					<span class="error-text">{result.publishError}</span>
				</p>
			{/if}
			<button onclick={onClose}>Done</button>
		</div>
	{:else}
		<form
			class="fields"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<label>
				Artist
				<input bind:value={artist} required />
			</label>
			<label>
				Title
				<input bind:value={title} required />
			</label>
			<label>
				Album <span class="muted">(optional)</span>
				<input bind:value={album} />
			</label>
			<label>
				Plain lyrics
				<textarea bind:value={plainLyrics} rows="8" required placeholder="One line per line…"
				></textarea>
			</label>
			<label>
				Synced lyrics <span class="muted">(optional — LRC format, e.g. [00:12.34] line)</span>
				<textarea
					bind:value={syncedLyrics}
					rows="8"
					placeholder={`[00:12.34] First line
[00:15.67] Next line…`}></textarea>
			</label>

			{#if errorMsg}
				<p class="error">{errorMsg}</p>
			{/if}

			<button type="submit" disabled={submitting}>
				{submitting ? 'Publishing…' : 'Publish & save'}
			</button>
		</form>
	{/if}
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
	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
	}
	.fields label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.fields input,
	.fields textarea {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.5rem;
		color: var(--text);
		font-family: inherit;
		resize: vertical;
	}
	.fields textarea {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
	}
	.fields button {
		margin-top: 0.25rem;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 6px;
		padding: 0.6rem;
		font-weight: 600;
	}
	.fields button:disabled {
		opacity: 0.6;
	}
	.muted {
		color: var(--muted);
		font-weight: 400;
	}
	.error {
		margin: 0;
		color: var(--status-error);
		font-size: 0.85rem;
	}
	.result {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.success {
		color: var(--status-synced);
		font-size: 0.9rem;
	}
	.partial {
		color: var(--status-plain);
		font-size: 0.9rem;
	}
	.error-text {
		display: block;
		margin-top: 0.4rem;
		color: var(--status-error);
		font-size: 0.8rem;
	}
	.result button {
		align-self: flex-start;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.5rem 1rem;
	}
</style>
