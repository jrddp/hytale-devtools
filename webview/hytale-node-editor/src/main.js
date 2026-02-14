import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { createMockVscodeApi } from './node-editor/devMockVscodeApi.js';

const vscode =
	typeof globalThis.acquireVsCodeApi === 'function'
		? globalThis.acquireVsCodeApi()
		: createMockVscodeApi();

const app = mount(App, {
	target: document.getElementById('app'),
	props: {
		vscode
	}
});

export default app;
