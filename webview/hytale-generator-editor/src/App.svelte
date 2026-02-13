<script>
	import { onMount } from 'svelte';

	export let vscode;

	let editorText = '';
	let syncedText = '';
	let sourceVersion = -1;
	let status = 'booting webview...';
	let extensionError = '';

	function handleMessage(event) {
		const message = event.data;
		if (!message || typeof message.type !== 'string') {
			return;
		}

		if (message.type === 'update') {
			editorText = typeof message.text === 'string' ? message.text : '';
			syncedText = editorText;
			sourceVersion = typeof message.version === 'number' ? message.version : sourceVersion;
			status = 'received document update from extension';
			extensionError = '';
			return;
		}

		if (message.type === 'error') {
			extensionError = typeof message.message === 'string' ? message.message : 'Unknown editor error.';
			status = 'received error from extension';
		}
	}

	function applyChanges() {
		vscode.postMessage({
			type: 'apply',
			text: editorText,
			sourceVersion
		});
		status = 'apply message sent';
	}

	function onInput() {
		status = editorText === syncedText ? 'synced' : 'local edits pending';
	}

	onMount(() => {
		window.addEventListener('message', handleMessage);
		status = 'webview script loaded';
		vscode.postMessage({ type: 'ready' });

		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});
</script>

<main>
	<h3>Hytale Generator Editor (Svelte Test)</h3>
	<div>Status: {status}</div>
	<div>Version: {sourceVersion}</div>

	{#if extensionError}
		<div class="error">{extensionError}</div>
	{/if}

	<textarea
		bind:value={editorText}
		on:input={onInput}
		spellcheck="false"
		aria-label="Hytale generator json"
		rows="18"
	/>

	<div>
		<button type="button" on:click={applyChanges}>Apply to File</button>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: var(--vscode-font-family, sans-serif);
		color: var(--vscode-editor-foreground);
		background: var(--vscode-editor-background);
	}

	main {
		padding: 12px;
	}

	textarea {
		width: 100%;
		box-sizing: border-box;
		margin-top: 8px;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border: 1px solid var(--vscode-panel-border);
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: var(--vscode-editor-font-size, 13px);
	}

	button {
		margin-top: 8px;
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
		border: 1px solid var(--vscode-button-border, transparent);
		padding: 6px 10px;
	}

	.error {
		margin-top: 8px;
		color: var(--vscode-errorForeground);
	}
</style>
