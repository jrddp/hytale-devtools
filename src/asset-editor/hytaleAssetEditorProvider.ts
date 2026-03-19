import * as vscode from "vscode";
import { type AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import { assetCacheRuntime, LOGGER, schemaRuntime } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import {
  type AssetEditorParentState,
  type AssetEditorExtensionToWebviewMessage,
  type AssetEditorWebviewToExtensionMessage,
} from "../shared/asset-editor/messageTypes";
import { type AssetDefinition } from "../shared/fieldTypes";
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
      const runtime = assetCacheRuntime;
      let isDisposed = false;
      if (!assetDefinition) {
        LOGGER.error(
          `No asset definition matched ${documentPath}. Falling back to the JSON editor.`,
        );
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
          // send minimal ref-resolutions to preserve memory
          const assetsByRef = Array.from(schemaRuntime.assetsByRef.entries()).reduce(
            (acc, [ref, asset]) => {
              if (assetDefinition.refDependencies.has(ref)) {
                acc[ref] = asset;
              }
              return acc;
            },
            {} as Record<string, AssetDefinition>,
          );

          const payload: AssetEditorExtensionToWebviewMessage = {
            type: "bootstrap",
            assetDefinition,
            assetsByRef,
            parent: resolveDocumentParentState(document, assetDefinition, runtime),
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

      const sendParentUpdate = () => {
        const payload: AssetEditorExtensionToWebviewMessage = {
          type: "parentUpdate",
          parent: resolveDocumentParentState(document, assetDefinition, runtime),
        };
        void webviewPanel.webview.postMessage(payload);
      };

      const sendResolvedParentUpdate = (parentName: string) => {
        const payload: AssetEditorExtensionToWebviewMessage = {
          type: "parentUpdate",
          parent: resolveParentState(assetDefinition, runtime, parentName),
        };
        void webviewPanel.webview.postMessage(payload);
      };

      const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === document.uri.toString()) {
          updateWebview();
          sendParentUpdate();
        }
      });

      webviewPanel.onDidDispose(() => {
        isDisposed = true;
        documentChangeSubscription.dispose();
      });

      webviewPanel.webview.onDidReceiveMessage((message: AssetEditorWebviewToExtensionMessage) => {
        LOGGER.info("Message received:", message.type);
        switch (message.type) {
          case "ready":
            sendBootstrap();
            updateWebview();
            if (!runtime.isReady) {
              void runtime.ready
                .then(() => {
                  if (!isDisposed && assetCacheRuntime === runtime) {
                    sendParentUpdate();
                  }
                })
                .catch(error => {
                  if (!isDisposed) {
                    void this.postError(
                      webviewPanel.webview,
                      `Failed to load base-game asset cache: ${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                });
            }
            return;
          case "autocompleteRequest":
            void this.autocompleteRequest(message, webviewPanel.webview);
            return;
          case "resolveParent":
            sendResolvedParentUpdate(message.parentName);
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

  private async autocompleteRequest(
    message: Extract<AssetEditorWebviewToExtensionMessage, { type: "autocompleteRequest" }>,
    webview: vscode.Webview,
  ): Promise<void> {
    const payload: AssetEditorExtensionToWebviewMessage = {
      type: "autocompletionValues",
      fieldId: message.fieldId,
      values: getValuesByIndexReference(message.symbolLookup),
    };
    await webview.postMessage(payload);
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

function resolveDocumentParentState(
  document: vscode.TextDocument,
  assetDefinition: AssetDefinition,
  runtime: AssetCacheRuntime,
): AssetEditorParentState {
  return resolveParentState(assetDefinition, runtime, readParentName(document));
}

function resolveParentState(
  assetDefinition: AssetDefinition,
  runtime: AssetCacheRuntime,
  parentName: string | undefined,
): AssetEditorParentState {
  if (!parentName) {
    return { status: "none" };
  }
  if (!runtime.isReady) {
    return {
      status: "loading",
      parentName,
    };
  }

  const parentInstance = runtime.getAsset(assetDefinition.title, parentName);
  if (!parentInstance) {
    return {
      status: "missing",
      parentName,
    };
  }

  return {
    status: "loaded",
    parentName,
    parentInstance,
  };
}

function readParentName(document: vscode.TextDocument): string | undefined {
  try {
    const documentJson = JSON.parse(document.getText()) as Record<string, unknown>;
    const parentValue = documentJson["Parent"];
    return typeof parentValue === "string" && parentValue.length > 0 ? parentValue : undefined;
  } catch {
    return undefined;
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
