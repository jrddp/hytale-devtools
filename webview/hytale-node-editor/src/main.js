import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const vscode = acquireVsCodeApi();

const app = mount(App, {
	target: document.getElementById('app'),
	props: {
		vscode
	}
});

export default app;
