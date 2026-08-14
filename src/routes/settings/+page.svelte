<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types.js';

	interface SettingRow {
		key: string;
		label: string;
		description: string;
		type: 'int' | 'bool' | 'enum';
		min?: number;
		values?: readonly string[];
		restartsWatcher?: boolean;
		value: number | boolean | string;
	}

	let { data }: PageProps = $props();

	let settings = $state<SettingRow[]>(data.settings as SettingRow[]);
	let drafts = $state<Record<string, string>>({});
	let status = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	let errors = $state<Record<string, string>>({});

	function draftFor(s: SettingRow): string {
		return drafts[s.key] ?? String(s.value);
	}

	function isDirty(s: SettingRow): boolean {
		return draftFor(s) !== String(s.value);
	}

	async function save(s: SettingRow) {
		status[s.key] = 'saving';
		errors[s.key] = '';
		const raw = draftFor(s);
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key: s.key, value: raw })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.message ?? res.statusText);
			}
			s.value = s.type === 'bool' ? raw === 'true' : s.type === 'int' ? Number(raw) : raw;
			delete drafts[s.key];
			status[s.key] = 'saved';
			setTimeout(() => {
				if (status[s.key] === 'saved') status[s.key] = 'idle';
			}, 2000);
		} catch (err) {
			status[s.key] = 'error';
			errors[s.key] = String(err instanceof Error ? err.message : err);
		}
	}

	let importInput = $state<HTMLInputElement>();
	let importResult = $state<{
		imported: number;
		skipped: { path: string; reason: string }[];
	} | null>(null);

	async function exportOverrides() {
		const res = await fetch('/api/overrides');
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `stanza-overrides-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function importOverridesFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const text = await file.text();
		input.value = '';
		const res = await fetch('/api/overrides', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: text
		});
		if (!res.ok) {
			importResult = { imported: 0, skipped: [{ path: '', reason: (await res.json()).error }] };
			return;
		}
		importResult = await res.json();
	}
</script>

<svelte:head>
	<title>Settings — Stanza</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={resolve('/')}>← Dashboard</a>
		<h1>Settings</h1>
	</header>

	<section class="card">
		<h2>Behavior</h2>
		<p class="muted intro">
			Changes here are saved to the state DB and take effect immediately — no restart needed (rows
			marked "restarts the watcher" briefly stop and restart filesystem watching to pick up the
			change). <code class="inline">MUSIC_DIR</code>, <code class="inline">DB_PATH</code>, and
			<code class="inline">LRCLIB_BASE_URL</code> aren't here since they can't be changed without
			restarting the whole process — set those via environment variables (see
			<code class="inline">.env.example</code>).
		</p>

		{#each settings as s (s.key)}
			<div class="setting-row">
				<div class="setting-info">
					<label for={s.key}>{s.label}</label>
					<p class="muted">
						{s.description}
						{#if s.restartsWatcher}&nbsp;· restarts the watcher{/if}
					</p>
				</div>
				<div class="setting-control">
					{#if s.type === 'bool'}
						<input
							id={s.key}
							type="checkbox"
							checked={draftFor(s) === 'true'}
							onchange={(e) => (drafts[s.key] = String(e.currentTarget.checked))}
						/>
					{:else if s.type === 'enum'}
						<select
							id={s.key}
							value={draftFor(s)}
							onchange={(e) => (drafts[s.key] = e.currentTarget.value)}
						>
							{#each s.values ?? [] as v (v)}
								<option value={v}>{v}</option>
							{/each}
						</select>
					{:else}
						<input
							id={s.key}
							type="number"
							min={s.min}
							value={draftFor(s)}
							oninput={(e) => (drafts[s.key] = e.currentTarget.value)}
						/>
					{/if}
					<button disabled={!isDirty(s) || status[s.key] === 'saving'} onclick={() => save(s)}>
						{status[s.key] === 'saving' ? 'Saving…' : 'Save'}
					</button>
					{#if status[s.key] === 'saved'}
						<span class="save-ok">Saved</span>
					{/if}
				</div>
				{#if status[s.key] === 'error'}
					<p class="error">{errors[s.key]}</p>
				{/if}
			</div>
		{/each}
	</section>

	<section class="card">
		<h2>Backup</h2>
		<p class="muted intro">
			Back up or restore every manually-matched track (picked via "Fix match" or "Contribute
			lyrics"), including each one's <code class="inline">.lrc</code> content.
		</p>
		<div class="backup-actions">
			<button class="secondary-btn" onclick={exportOverrides}> Export overrides </button>
			<button class="secondary-btn" onclick={() => importInput?.click()}> Import overrides </button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json"
				class="hidden-file-input"
				onchange={importOverridesFile}
			/>
		</div>

		{#if importResult}
			<div class="import-result">
				<span>
					Imported {importResult.imported} override{importResult.imported === 1 ? '' : 's'}.
					{#if importResult.skipped.length}
						{importResult.skipped.length} skipped.
					{/if}
				</span>
				{#if importResult.skipped.length}
					<details>
						<summary>Details</summary>
						<ul>
							{#each importResult.skipped as item (item.path + item.reason)}
								<li><code>{item.path}</code> — {item.reason}</li>
							{/each}
						</ul>
					</details>
				{/if}
				<button class="link-btn" onclick={() => (importResult = null)}>Dismiss</button>
			</div>
		{/if}
	</section>

	<section class="card">
		<h2>Environment</h2>
		<p class="muted intro">
			Set via environment variables — see <code class="inline">.env.example</code>.
		</p>
		<dl class="env-list">
			<dt>MUSIC_DIR</dt>
			<dd>{data.musicDir}</dd>
			<dt>DB_PATH</dt>
			<dd>{data.dbPath}</dd>
			<dt>LRCLIB_BASE_URL</dt>
			<dd>{data.lrclibBaseUrl}</dd>
		</dl>
	</section>
</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1.5rem;
	}
	.back {
		font-size: 0.85rem;
		color: var(--muted);
		text-decoration: none;
		width: fit-content;
	}
	.back:hover {
		color: var(--text);
	}
	h1 {
		margin: 0;
		font-size: 1.4rem;
	}
	.muted {
		color: var(--muted);
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}
	.card h2 {
		margin: 0 0 0.5rem;
		font-size: 1.05rem;
	}
	.intro {
		font-size: 0.85rem;
		margin: 0 0 1.25rem;
		line-height: 1.6;
	}
	code.inline {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85em;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.05em 0.4em;
	}
	.setting-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem 1.5rem;
		padding: 0.9rem 0;
		border-top: 1px solid var(--border);
	}
	.setting-row:first-of-type {
		border-top: none;
		padding-top: 0;
	}
	.setting-info {
		flex: 1 1 320px;
		min-width: 0;
	}
	.setting-info label {
		display: block;
		font-size: 0.88rem;
		font-weight: 600;
	}
	.setting-info p {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.setting-control {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 0 0 auto;
	}
	.setting-control input[type='number'],
	.setting-control select {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.4rem 0.6rem;
		color: var(--text);
		width: 9rem;
	}
	.setting-control input[type='checkbox'] {
		width: 1.1rem;
		height: 1.1rem;
	}
	.setting-control button {
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 6px;
		padding: 0.4rem 0.8rem;
		font-weight: 600;
		font-size: 0.82rem;
	}
	.setting-control button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.save-ok {
		color: var(--status-synced);
		font-size: 0.8rem;
	}
	.error {
		width: 100%;
		margin: 0;
		color: var(--status-error);
		font-size: 0.8rem;
	}
	.backup-actions {
		display: flex;
		gap: 0.75rem;
	}
	.secondary-btn {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		font-weight: 500;
	}
	.hidden-file-input {
		display: none;
	}
	.import-result {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.6rem 0.9rem;
		margin-top: 1rem;
		font-size: 0.85rem;
	}
	.import-result details {
		flex-basis: 100%;
	}
	.import-result li {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.link-btn {
		background: none;
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
		font-size: 0.78rem;
	}
	.env-list {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem 1rem;
		margin: 0;
		font-size: 0.85rem;
	}
	.env-list dt {
		color: var(--muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
	}
	.env-list dd {
		margin: 0;
		word-break: break-all;
	}
</style>
