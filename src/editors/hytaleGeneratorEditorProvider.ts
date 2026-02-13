import * as vscode from 'vscode';
import * as fs from 'node:fs';

type WebviewToExtensionMessage =
	| { type: 'ready' }
	| { type: 'apply'; text: string; sourceVersion?: number };

type ExtensionToWebviewMessage =
	| { type: 'update'; text: string; version: number }
	| { type: 'error'; message: string };

type ViteManifestEntry = {
	file: string;
	css?: string[];
	isEntry?: boolean;
};

type WebviewAssetUris =
	| { ok: true; scriptUri: vscode.Uri; styleUris: vscode.Uri[] }
	| { ok: false; reason: string };

const VIEW_TYPE = 'hytale-devtools.hytaleGeneratorEditor';

export function registerHytaleGeneratorEditorProvider(
	context: vscode.ExtensionContext
): vscode.Disposable {
	const provider = new HytaleGeneratorEditorProvider(context);
	return vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider);
}

class HytaleGeneratorEditorProvider implements vscode.CustomTextEditorProvider {
	constructor(private readonly context: vscode.ExtensionContext) { }

	public resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel
	): void {
		try {
			webviewPanel.webview.options = {
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.context.extensionUri, 'media', 'hytaleGeneratorEditor')
				]
			};

			webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

			const updateWebview = () => {
				const payload: ExtensionToWebviewMessage = {
					type: 'update',
					text: document.getText(),
					version: document.version
				};
				void webviewPanel.webview.postMessage(payload);
			};

			const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
				if (event.document.uri.toString() === document.uri.toString()) {
					updateWebview();
				}
			});

			webviewPanel.onDidDispose(() => {
				documentChangeSubscription.dispose();
			});

			webviewPanel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
				switch (message.type) {
					case 'ready':
						updateWebview();
						return;
					case 'apply':
						void this.applyWebviewEdits(document, message, webviewPanel.webview, updateWebview);
						return;
					default:
						return;
				}
			});

			updateWebview();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error('Failed to resolve Hytale Generator custom editor:', message);
			void vscode.window.showErrorMessage(`Hytale Generator editor failed to load: ${message}`);
			webviewPanel.webview.html = `<html><body><h3>Hytale Generator editor failed to load</h3><pre>${escapeHtml(message)}</pre></body></html>`;
		}
	}

	private async applyWebviewEdits(
		document: vscode.TextDocument,
		message: Extract<WebviewToExtensionMessage, { type: 'apply' }>,
		webview: vscode.Webview,
		updateWebview: () => void
	): Promise<void> {
		if (typeof message.text !== 'string') {
			return;
		}

		if (typeof message.sourceVersion === 'number' && message.sourceVersion !== document.version) {
			await this.postError(webview, 'The file changed in another editor. Please retry.');
			updateWebview();
			return;
		}

		const edit = new vscode.WorkspaceEdit();
		const normalizedText = normalizeTextEol(message.text, document.eol);
		edit.replace(document.uri, getDocumentRange(document), normalizedText);
		const applied = await vscode.workspace.applyEdit(edit);

		if (!applied) {
			await this.postError(webview, 'VS Code rejected the edit request.');
		}
	}

	private async postError(webview: vscode.Webview, message: string): Promise<void> {
		const payload: ExtensionToWebviewMessage = {
			type: 'error',
			message
		};
		await webview.postMessage(payload);
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const assets = this.getSvelteWebviewAssets(webview);
		if (!assets.ok) {
			return this.getMissingAssetsHtml(assets.reason);
		}

		const styleTags = assets.styleUris
			.map((styleUri) => `<link href="${styleUri}" rel="stylesheet" />`)
			.join('\n');

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src ${webview.cspSource};"
	/>
	<title>Hytale Generator Editor</title>
	${styleTags}
</head>
<body>
	<div id="app"></div>
	<script type="module" src="${assets.scriptUri}"></script>
</body>
</html>`;
	}

	private getSvelteWebviewAssets(webview: vscode.Webview): WebviewAssetUris {
		const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'hytaleGeneratorEditor');
		const manifestUri = vscode.Uri.joinPath(mediaRoot, '.vite', 'manifest.json');

		if (fs.existsSync(manifestUri.fsPath)) {
			try {
				const manifestText = fs.readFileSync(manifestUri.fsPath, 'utf8');
				const manifest = JSON.parse(manifestText) as Record<string, ViteManifestEntry>;
				const entry = manifest['index.html'] ?? Object.values(manifest).find((value) => value?.isEntry);

				if (entry?.file) {
					const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, entry.file));
					const cssPaths = new Set<string>(entry.css ?? []);
					if (cssPaths.size === 0) {
						for (const [sourcePath, item] of Object.entries(manifest)) {
							if (sourcePath.endsWith('.css') && typeof item?.file === 'string') {
								cssPaths.add(item.file);
							}
						}
					}
					const styleUris = Array.from(cssPaths)
						.map((cssPath) => webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, cssPath)));

					return { ok: true, scriptUri, styleUris };
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { ok: false, reason: `Could not parse webview build manifest: ${message}` };
			}
		}

		const fallbackScript = vscode.Uri.joinPath(mediaRoot, 'main.js');
		if (fs.existsSync(fallbackScript.fsPath)) {
			return {
				ok: true,
				scriptUri: webview.asWebviewUri(fallbackScript),
				styleUris: []
			};
		}

		return {
			ok: false,
			reason: 'Svelte webview bundle was not found. Run `pnpm run build:webview` and reload the extension host.'
		};
	}

	private getMissingAssetsHtml(reason: string): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Hytale Node Editor</title>
</head>
<body>
	<h3>Hytale Generator Editor could not load</h3>
	<p>${escapeHtml(reason)}</p>
</body>
</html>`;
	}
}

function getDocumentRange(document: vscode.TextDocument): vscode.Range {
	const start = new vscode.Position(0, 0);
	const lastLine = document.lineAt(document.lineCount - 1);
	const end = new vscode.Position(document.lineCount - 1, lastLine.text.length);
	return new vscode.Range(start, end);
}

function normalizeTextEol(text: string, eol: vscode.EndOfLine): string {
	const targetEol = eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
	return text.replace(/\r\n|\r|\n/g, targetEol);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
