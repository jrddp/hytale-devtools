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

<main class="p-3">
	<h3 class="text-base font-semibold">Hytale Generator Editor (Svelte Test)</h3>
	<div class="mt-1 text-red-500">Status: {status}</div>
	<div>Version: {sourceVersion}</div>

	{#if extensionError}
		<div class="mt-2 text-[var(--vscode-errorForeground)]">{extensionError}</div>
	{/if}

	<textarea
		class="mt-2 w-full box-border border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-2 text-[var(--vscode-input-foreground)]"
		style="font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px);"
		bind:value={editorText}
		on:input={onInput}
		spellcheck="false"
		aria-label="Hytale generator json"
		rows="18"
	/>

	<div>
		<button
			class="mt-2 border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-2.5 py-1.5 text-[var(--vscode-button-foreground)]"
			type="button"
			on:click={applyChanges}
		>
			Apply to File
		</button>
	</div>
</main>
