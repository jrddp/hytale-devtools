import * as vscode from "vscode";
import * as fs from "node:fs";
import { type ResolveSchemaDefinitionRequestItem } from "../shared/companion/types";
import { resolveWorkspaceContext } from "./workspaceResolver";
import type {
  ExtensionToWebviewMessage,
  NodeEditorControlScheme,
  NodeEditorPlatform,
  WebviewToExtensionMessage,
} from "../shared/node-editor/messageTypes";
import { LOGGER } from "../extension";

type ViteManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
};

type WebviewAssetUris =
  | { ok: true; scriptUri: vscode.Uri; styleUris: vscode.Uri[] }
  | { ok: false; reason: string };

const VIEW_TYPE = "hytale-devtools.hytaleNodeEditor";
const WEBVIEW_FIND_COMMAND_ID = "editor.action.webvieweditor.showFind";
const NODE_EDITOR_QUICK_ACTION_COMMAND_PREFIX = "hytale-devtools.nodeEditor.quickAction.";
const EXTENSION_CONFIG_NAMESPACE = "hytale-devtools";
const NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY = "nodeEditor.controlScheme";
const DEFAULT_NODE_EDITOR_CONTROL_SCHEME: NodeEditorControlScheme = "mouse";

export function registerHytaleNodeEditorProvider(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const provider = new HytaleNodeEditorProvider(context);
  const providerRegistration = vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
    webviewOptions: {
      enableFindWidget: true,
    },
  });
  const quickActionCommandRegistrations = readNodeEditorQuickActionCommandIds(context).map(
    commandId =>
      vscode.commands.registerCommand(commandId, () => {
        void provider.triggerQuickActionByCommandId(commandId);
      }),
  );

  return vscode.Disposable.from(providerRegistration, provider, ...quickActionCommandRegistrations);
}

class HytaleNodeEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly webviewPanelsByDocumentUri = new Map<string, vscode.WebviewPanel>();
  private activeDocumentPath: string | undefined;
  private nativeFindCommandRegistration: vscode.Disposable | undefined;
  private selectionSubscription: vscode.Disposable | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Watch editor selection changes
    vscode.window.onDidChangeTextEditorSelection(event => {
      const uri = event.textEditor.document.uri.toString();
      const selection = event.selections[0];
      if (selection) {
        const webviewPanel = this.webviewPanelsByDocumentUri.get(uri);
        const payload: ExtensionToWebviewMessage = {
          type: "revealSelection",
          selection: selection,
        };
        webviewPanel?.webview.postMessage(payload);
      }
    });
  }

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    try {
      const documentPath = document.uri.fsPath;
      this.webviewPanelsByDocumentUri.set(documentPath, webviewPanel);
      if (webviewPanel.active) {
        this.activeDocumentPath = documentPath;
      }
      this.updateNativeFindCommandRegistration();

      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media", "hytaleNodeEditor"),
        ],
      };

      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

      const sendBootstrap = () => {
        const workspaceContext = resolveWorkspaceContext(documentPath);
        if (!workspaceContext) {
          this.postError(
            webviewPanel.webview,
            `Workspace context could not be resolved for path ${documentPath}.`,
          );
          return;
        }
        const payload: ExtensionToWebviewMessage = {
          type: "bootstrap",
          workspaceContext: workspaceContext,
          controlScheme: readNodeEditorControlScheme(),
          platform: readNodeEditorPlatform(),
        };
        void webviewPanel.webview.postMessage(payload);
      };

      const updateWebview = () => {
        const payload: ExtensionToWebviewMessage = {
          type: "update",
          text: document.getText(),
          version: document.version,
          documentPath,
        };
        void webviewPanel.webview.postMessage(payload);
      };

      const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      });

      const panelViewStateSubscription = webviewPanel.onDidChangeViewState(event => {
        if (event.webviewPanel.active) {
          this.activeDocumentPath = documentPath;
        } else if (this.activeDocumentPath === documentPath) {
          this.activeDocumentPath = undefined;
        }

        this.updateNativeFindCommandRegistration();
      });

      webviewPanel.onDidDispose(() => {
        documentChangeSubscription.dispose();
        panelViewStateSubscription.dispose();

        const existingPanel = this.webviewPanelsByDocumentUri.get(documentPath);
        if (existingPanel === webviewPanel) {
          this.webviewPanelsByDocumentUri.delete(documentPath);
        }
        if (this.activeDocumentPath === documentPath) {
          this.activeDocumentPath = undefined;
        }

        this.updateNativeFindCommandRegistration();
      });

      webviewPanel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        switch (message.type) {
          case "ready":
            sendBootstrap();
            updateWebview();
            return;
          case "apply":
            void this.applyWebviewEdits(document, message, webviewPanel.webview, updateWebview);
            return;
          case "openRawJson":
            void this.openRawJsonInTextEditor(document, webviewPanel);
            return;
          case "openKeybindings":
            void this.openNodeEditorKeybindings(message.query);
            return;
          case "update-setting":
            void this.updateNodeEditorSetting(message, webviewPanel.webview);
            return;
          default:
            return;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to resolve Hytale Node custom editor:", message);
      void vscode.window.showErrorMessage(`Hytale Node editor failed to load: ${message}`);
      webviewPanel.webview.html = `<html><body><h3>Hytale Node editor failed to load</h3><pre>${escapeHtml(message)}</pre></body></html>`;
    }
  }

  public dispose(): void {
    this.disposeNativeFindCommandRegistration();
    this.selectionSubscription?.dispose();
    this.selectionSubscription = undefined;
  }

  public async triggerQuickActionByCommandId(commandId: string): Promise<void> {
    const normalizedCommandId = readNonEmptyString(commandId);
    if (!normalizedCommandId) {
      return;
    }

    const targetPanel = this.resolveTargetWebviewPanel();
    if (!targetPanel) {
      return;
    }

    const payload: ExtensionToWebviewMessage = {
      type: "triggerQuickAction",
      commandId: normalizedCommandId,
    };
    await targetPanel.webview.postMessage(payload);
  }

  private resolveTargetWebviewPanel(): vscode.WebviewPanel | undefined {
    const activePanel = this.activeDocumentPath
      ? this.webviewPanelsByDocumentUri.get(this.activeDocumentPath)
      : undefined;
    if (activePanel) {
      return activePanel;
    }

    for (const webviewPanel of this.webviewPanelsByDocumentUri.values()) {
      if (webviewPanel.visible) {
        return webviewPanel;
      }
    }

    for (const webviewPanel of this.webviewPanelsByDocumentUri.values()) {
      return webviewPanel;
    }

    return undefined;
  }

  private updateNativeFindCommandRegistration(): void {
    if (this.hasActiveNodeEditorPanel()) {
      if (!this.nativeFindCommandRegistration) {
        this.nativeFindCommandRegistration = vscode.commands.registerCommand(
          WEBVIEW_FIND_COMMAND_ID,
          () => {
            void this.triggerQuickActionByCommandId(WEBVIEW_FIND_COMMAND_ID);
          },
        );
      }
      return;
    }

    this.disposeNativeFindCommandRegistration();
  }

  private disposeNativeFindCommandRegistration(): void {
    if (this.nativeFindCommandRegistration) {
      this.nativeFindCommandRegistration.dispose();
      this.nativeFindCommandRegistration = undefined;
    }
  }

  private hasActiveNodeEditorPanel(): boolean {
    for (const panel of this.webviewPanelsByDocumentUri.values()) {
      if (panel.active) {
        return true;
      }
    }

    return false;
  }

  private async applyWebviewEdits(
    document: vscode.TextDocument,
    message: Extract<WebviewToExtensionMessage, { type: "apply" }>,
    webview: vscode.Webview,
    updateWebview: () => void,
  ): Promise<void> {
    if (typeof message.text !== "string") {
      LOGGER.error("Unable to apply edit from node editor! Message text not parsed as string.");
      return;
    }

    if (typeof message.sourceVersion === "number" && message.sourceVersion !== document.version) {
      LOGGER.error("Version mismatch detected when applying edit from node editor.");
      await this.postError(webview, "The file changed in another editor. Please retry.");
      updateWebview();
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const normalizedText = normalizeTextEol(message.text, document.eol);
    edit.replace(document.uri, getDocumentRange(document), normalizedText);
    const applied = await vscode.workspace.applyEdit(edit);

    if (!applied) {
      await this.postError(webview, "VS Code rejected the edit request.");
    }
  }

  private async openRawJsonInTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const targetViewColumn = webviewPanel.viewColumn ?? vscode.ViewColumn.Active;
    await vscode.window.showTextDocument(document, {
      viewColumn: targetViewColumn,
      preserveFocus: false,
      preview: true,
    });
  }

  private async openNodeEditorKeybindings(queryCandidate: string | undefined): Promise<void> {
    const query = readNonEmptyString(queryCandidate) ?? "Hytale Node Editor";
    await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", query);
  }

  private async updateNodeEditorSetting(
    message: Extract<WebviewToExtensionMessage, { type: "update-setting" }>,
    webview: vscode.Webview,
  ): Promise<void> {
    try {
      switch (message.setting) {
        case "controlScheme":
          await vscode.workspace
            .getConfiguration(EXTENSION_CONFIG_NAMESPACE)
            .update(
              NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY,
              message.value,
              vscode.ConfigurationTarget.Global,
            );
          return;
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      LOGGER.error(`Failed to update node editor setting "${message.setting}": ${details}`);
      await this.postError(webview, "Failed to persist node editor setting.");
    }
  }

  private async postError(webview: vscode.Webview, message: string): Promise<void> {
    const payload: ExtensionToWebviewMessage = {
      type: "error",
      message,
    };
    await webview.postMessage(payload);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const assets = this.getSvelteWebviewAssets(webview);
    if (!assets.ok) {
      return this.getMissingAssetsHtml(assets.reason);
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
	<title>Hytale Node Editor</title>
	${styleTags}
</head>
<body>
	<div id="app"></div>
	<script type="module" src="${assets.scriptUri}"></script>
</body>
</html>`;
  }

  private getSvelteWebviewAssets(webview: vscode.Webview): WebviewAssetUris {
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media", "hytaleNodeEditor");
    const manifestUri = vscode.Uri.joinPath(mediaRoot, ".vite", "manifest.json");

    if (fs.existsSync(manifestUri.fsPath)) {
      try {
        const manifestText = fs.readFileSync(manifestUri.fsPath, "utf8");
        const manifest = JSON.parse(manifestText) as Record<string, ViteManifestEntry>;
        const entry =
          manifest["index.html"] ?? Object.values(manifest).find(value => value?.isEntry);

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

  private getMissingAssetsHtml(reason: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Hytale Node Editor</title>
</head>
<body>
	<h3>Hytale Node Editor could not load</h3>
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
  const targetEol = eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  return text.replace(/\r\n|\r|\n/g, targetEol);
}

function readNodeEditorControlScheme(): NodeEditorControlScheme {
  const configuredValue = vscode.workspace
    .getConfiguration(EXTENSION_CONFIG_NAMESPACE)
    .get<string>(NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY);
  if (configuredValue === "trackpad") {
    return "trackpad";
  }

  return DEFAULT_NODE_EDITOR_CONTROL_SCHEME;
}

function readNodeEditorPlatform(): NodeEditorPlatform {
  if (process.platform === "darwin") {
    return "mac";
  }

  if (process.platform === "linux") {
    return "linux";
  }

  return "win";
}

function readNodeEditorQuickActionCommandIds(context: vscode.ExtensionContext): string[] {
  const packageJson = context.extension.packageJSON;
  if (!isObject(packageJson)) {
    return [];
  }

  const contributes = packageJson.contributes;
  if (!isObject(contributes) || !Array.isArray(contributes.commands)) {
    return [];
  }

  const commandIds = contributes.commands
    .filter(candidate => isObject(candidate))
    .map(candidate => readNonEmptyString(candidate.command))
    .filter((commandId): commandId is string =>
      Boolean(commandId?.startsWith(NODE_EDITOR_QUICK_ACTION_COMMAND_PREFIX)),
    );
  return Array.from(new Set(commandIds));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
