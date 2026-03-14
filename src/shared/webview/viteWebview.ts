import * as fs from "node:fs";
import * as vscode from "vscode";

type ViteManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
};

type WebviewAssetUris =
  | { ok: true; scriptUri: vscode.Uri; styleUris: vscode.Uri[] }
  | { ok: false; reason: string };

type BuildViteWebviewHtmlOptions = {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  mediaDirectoryName: string;
  title: string;
};

export function resolveWebviewMediaRoot(
  extensionUri: vscode.Uri,
  mediaDirectoryName: string,
): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, "media", mediaDirectoryName);
}

export function buildViteWebviewHtml({
  webview,
  extensionUri,
  mediaDirectoryName,
  title,
}: BuildViteWebviewHtmlOptions): string {
  const assets = getViteWebviewAssets(webview, extensionUri, mediaDirectoryName);
  if (!assets.ok) {
    return getMissingAssetsHtml(title, assets.reason);
  }

  const styleTags = assets.styleUris
    .map(styleUri => `<link href="${styleUri}" rel="stylesheet" />`)
    .join("\n");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src ${webview.cspSource}; connect-src ${webview.cspSource};"
	/>
	<title>${escapeHtml(title)}</title>
	${styleTags}
</head>
<body>
	<div id="app"></div>
	<script type="module" src="${assets.scriptUri}"></script>
</body>
</html>`;
}

function getViteWebviewAssets(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  mediaDirectoryName: string,
): WebviewAssetUris {
  const mediaRoot = resolveWebviewMediaRoot(extensionUri, mediaDirectoryName);
  const manifestUri = vscode.Uri.joinPath(mediaRoot, ".vite", "manifest.json");

  if (fs.existsSync(manifestUri.fsPath)) {
    try {
      const manifestText = fs.readFileSync(manifestUri.fsPath, "utf8");
      const manifest = JSON.parse(manifestText) as Record<string, ViteManifestEntry>;
      const entry = manifest["index.html"] ?? Object.values(manifest).find(value => value?.isEntry);

      if (entry?.file) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, entry.file));
        const cssPaths = new Set<string>(entry.css ?? []);
        if (cssPaths.size === 0) {
          for (const [sourcePath, item] of Object.entries(manifest)) {
            if (sourcePath.endsWith(".css") && typeof item?.file === "string") {
              cssPaths.add(item.file);
            }
          }
        }
        const styleUris = Array.from(cssPaths).map(cssPath =>
          webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, cssPath)),
        );

        return { ok: true, scriptUri, styleUris };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `Could not parse webview build manifest: ${message}` };
    }
  }

  const fallbackScript = vscode.Uri.joinPath(mediaRoot, "main.js");
  if (fs.existsSync(fallbackScript.fsPath)) {
    return {
      ok: true,
      scriptUri: webview.asWebviewUri(fallbackScript),
      styleUris: [],
    };
  }

  return {
    ok: false,
    reason:
      "Svelte webview bundle was not found. Run `pnpm run build:webview` and reload the extension host.",
  };
}

function getMissingAssetsHtml(title: string, reason: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(title)}</title>
</head>
<body>
	<h3>${escapeHtml(title)} could not load</h3>
	<p>${escapeHtml(reason)}</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
