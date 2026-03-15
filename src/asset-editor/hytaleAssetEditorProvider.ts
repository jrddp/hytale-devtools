import * as vscode from "vscode";
import { LOGGER, schemaRuntime } from "../extension";
import {
  type AssetEditorExtensionToWebviewMessage,
  type AssetEditorWebviewToExtensionMessage,
} from "../shared/asset-editor/messageTypes";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";

const VIEW_TYPE = "hytale-devtools.hytaleAssetEditor";

export function registerHytaleAssetEditorProvider(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const provider = new HytaleAssetEditorProvider(context);
  return vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
    webviewOptions: {
      enableFindWidget: true,
    },
    supportsMultipleEditorsPerDocument: true,
  });
}

class HytaleAssetEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    try {
      const documentPath = document.uri.fsPath;
      const assetDefinition = schemaRuntime.getAssetDefinitionForPath(documentPath);
      if (!assetDefinition) {
        LOGGER.error(`No asset definition matched ${documentPath}. Falling back to the JSON editor.`);
        void this.openRawJsonInTextEditor(document, webviewPanel).finally(() => {
          webviewPanel.dispose();
        });
        return;
      }

      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          resolveWebviewMediaRoot(this.context.extensionUri, "hytaleAssetEditor"),
        ],
      };

      webviewPanel.webview.html = buildViteWebviewHtml({
        webview: webviewPanel.webview,
        extensionUri: this.context.extensionUri,
        mediaDirectoryName: "hytaleAssetEditor",
        title: "Hytale Asset Editor",
      });

      const sendBootstrap = () => {
        try {
          const payload: AssetEditorExtensionToWebviewMessage = {
            type: "bootstrap",
            assetDefinition,
          };
          void webviewPanel.webview.postMessage(payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          LOGGER.error(`Unable to build asset editor schema data: ${message}`);
          void this.postError(webviewPanel.webview, message);
        }
      };

      const updateWebview = () => {
        const payload: AssetEditorExtensionToWebviewMessage = {
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

      webviewPanel.onDidDispose(() => {
        documentChangeSubscription.dispose();
      });

      webviewPanel.webview.onDidReceiveMessage((message: AssetEditorWebviewToExtensionMessage) => {
        LOGGER.info(`Asset editor message received: ${JSON.stringify(message, null, 2)}`);
        switch (message.type) {
          case "ready":
            sendBootstrap();
            updateWebview();
            return;
          case "apply":
            void this.applyWebviewEdits(document, message, webviewPanel.webview);
            return;
          case "openRawJson":
            void this.openRawJsonInTextEditor(document, webviewPanel);
            return;
          default:
            return;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to resolve Hytale Asset custom editor:", message);
      void vscode.window.showErrorMessage(`Hytale Asset editor failed to load: ${message}`);
      webviewPanel.webview.html = `<html><body><h3>Hytale Asset editor failed to load</h3><pre>${escapeHtml(message)}</pre></body></html>`;
    }
  }

  private async postError(webview: vscode.Webview, message: string): Promise<void> {
    const payload: AssetEditorExtensionToWebviewMessage = {
      type: "error",
      message,
    };
    await webview.postMessage(payload);
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

  private async applyWebviewEdits(
    document: vscode.TextDocument,
    message: Extract<AssetEditorWebviewToExtensionMessage, { type: "apply" }>,
    webview: vscode.Webview,
  ): Promise<void> {
    if (typeof message.text !== "string") {
      LOGGER.error("Unable to apply edit from asset editor. Message text was not a string.");
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
