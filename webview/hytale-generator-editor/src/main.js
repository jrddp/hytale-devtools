import App from './App.svelte';
import './app.css';

const vscode = acquireVsCodeApi();

const app = new App({
	target: document.getElementById('app'),
	props: {
		vscode
	}
});

export default app;
