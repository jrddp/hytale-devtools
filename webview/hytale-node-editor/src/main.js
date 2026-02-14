import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { createMockVscodeApi } from './node-editor/devMockVscodeApi.js';
import { TEMPLATE_SOURCE_MODE } from './node-editor/templateCatalog.js';

const hasVsCodeApi = typeof globalThis.acquireVsCodeApi === 'function';
const vscode =
	hasVsCodeApi
		? globalThis.acquireVsCodeApi()
		: createMockVscodeApi();

const app = mount(App, {
	target: document.getElementById('app'),
	props: {
		vscode,
		templateSourceMode: hasVsCodeApi
			? TEMPLATE_SOURCE_MODE.WORKSPACE_HG_JAVA
			: TEMPLATE_SOURCE_MODE.DEV_PRESETS
	}
});

export default app;
