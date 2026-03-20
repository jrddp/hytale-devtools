import * as vscode from "vscode";
import { type AssetCacheRuntime } from "../asset-cache/assetCacheRuntime";
import { assetCacheRuntime, LOGGER, schemaRuntime } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import {
  type AssetEditorBootstrapMessage,
  type AssetEditorExtensionToWebviewMessage,
  type AssetEditorParentState,
  type AssetEditorPreview,
  type AssetEditorPreviewRequest,
  type AssetEditorPreviewUpdateMessage,
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
      let previewResolutionVersion = 0;
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

      const sendBootstrap = async (loadPreview: boolean) => {
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

          const parent = resolveDocumentParentState(document, assetDefinition, runtime);

          const payload: AssetEditorBootstrapMessage = {
            type: "bootstrap",
            assetDefinition,
            assetsByRef,
            parent,
            preview: loadPreview
              ? await resolveDocumentPreview(document, assetDefinition, parent, runtime)
              : { type: assetDefinition.preview ?? "none", loading: true },
          };

          if (!isDisposed) {
            await webviewPanel.webview.postMessage(payload);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          LOGGER.error(`Unable to build asset editor schema data: ${message}`);
          if (!isDisposed) {
            await this.postError(webviewPanel.webview, message);
          }
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

      const postResolvedPreview = async (previewPromise: Promise<AssetEditorPreview | undefined>) => {
        const resolutionVersion = ++previewResolutionVersion;
        const preview = await previewPromise;
        if (isDisposed || resolutionVersion !== previewResolutionVersion) {
          return;
        }

        await webviewPanel.webview.postMessage({
          type: "previewUpdate",
          preview,
        } satisfies AssetEditorPreviewUpdateMessage);
      };

      const sendResolvedParentAndPreview = async (parent: AssetEditorParentState) => {
        if (isDisposed) {
          return;
        }

        await webviewPanel.webview.postMessage({
          type: "parentUpdate",
          parent,
        } satisfies AssetEditorExtensionToWebviewMessage);

        if (!runtime.isReady || isDisposed) {
          return;
        }

        await postResolvedPreview(resolveDocumentPreview(document, assetDefinition, parent, runtime));
      };

      const sendResolvedPreview = async (request: AssetEditorPreviewRequest) => {
        if (isDisposed) {
          return;
        }

        if (!runtime.isReady) {
          await webviewPanel.webview.postMessage({
            type: "previewUpdate",
            preview: { type: request.type, loading: true },
          } satisfies AssetEditorPreviewUpdateMessage);
          return;
        }

        await postResolvedPreview(resolvePreviewRequest(request, runtime));
      };

      const sendResolvedDocumentParentAndPreview = () => {
        const parent = resolveDocumentParentState(document, assetDefinition, runtime);
        void sendResolvedParentAndPreview(parent);
      };

      const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === document.uri.toString()) {
          updateWebview();
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
            if (runtime.isReady) {
              void sendBootstrap(true).finally(() => {
                if (!isDisposed) {
                  updateWebview();
                }
              });
              return;
            }

            void sendBootstrap(false);
            updateWebview();
            void runtime.ready
              .then(() => {
                if (!isDisposed && assetCacheRuntime === runtime) {
                  sendResolvedDocumentParentAndPreview();
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
            return;
          case "autocompleteRequest":
            void this.autocompleteRequest(message, webviewPanel.webview);
            return;
          case "resolveParent":
            void sendResolvedParentAndPreview(
              resolveParentState(assetDefinition, runtime, message.parentName),
            );
            return;
          case "resolvePreview":
            void sendResolvedPreview(message.request);
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
  const jsonData = readDocumentJson(document);
  const parentName = jsonData?.["Parent"] as string | undefined;
  return resolveParentState(assetDefinition, runtime, parentName);
}

function resolveParentState(
  assetDefinition: AssetDefinition,
  runtime: AssetCacheRuntime,
  parentName: string | undefined,
): AssetEditorParentState {
  if (!parentName) {
    return { status: "none" };
  }
  const parentData = runtime.getAsset(assetDefinition.title, parentName);
  if (parentData) {
    return { status: "loaded", parentName, parentInstance: parentData };
  }
  if (!runtime.isReady) {
    return { status: "loading", parentName };
  }
  return { status: "missing", parentName };
}

async function resolveDocumentPreview(
  document: vscode.TextDocument,
  assetDefinition: AssetDefinition,
  parent: AssetEditorParentState,
  runtime: AssetCacheRuntime,
): Promise<AssetEditorPreview | undefined> {
  const jsonData = readDocumentJson(document);
  const parentData = parent.parentInstance?.rawJson;
  const iconPath = (jsonData?.["Icon"] ?? parentData?.["Icon"]) as string | undefined;
  const modelPath = (jsonData?.["Model"] ?? parentData?.["Model"]) as string | undefined;
  const texturePath = resolveWithFallbackTexture(
    (jsonData?.["Texture"] ?? parentData?.["Texture"]) as string | undefined,
    modelPath,
  );

  switch (assetDefinition.preview) {
    case "Item":
      return await resolveItemPreview(iconPath, runtime);
    case "Model":
      return await resolveModelPreview(modelPath, texturePath, runtime);
    default:
      return undefined;
  }
}

async function resolvePreviewRequest(
  request: AssetEditorPreviewRequest,
  runtime: AssetCacheRuntime,
): Promise<AssetEditorPreview> {
  switch (request.type) {
    case "Item":
      return await resolveItemPreview(request.iconPath, runtime);
    case "Model":
      return await resolveModelPreview(
        request.modelPath,
        resolveWithFallbackTexture(request.texturePath, request.modelPath),
        runtime,
      );
  }
}

async function resolveItemPreview(
  iconPath: string | undefined,
  runtime: AssetCacheRuntime,
): Promise<AssetEditorPreview> {
  const iconBytes = iconPath ? await runtime.readAssetBytesByPath(iconPath) : undefined;
  return {
    type: "Item",
    icon: iconBytes ? Array.from(iconBytes) : undefined,
  };
}

async function resolveModelPreview(
  modelPath: string | undefined,
  texturePath: string | undefined,
  runtime: AssetCacheRuntime,
): Promise<AssetEditorPreview> {
  const [modelAsset, textureBytes] = await Promise.all([
    modelPath ? runtime.loadAssetByPath(modelPath) : undefined,
    texturePath ? runtime.readAssetBytesByPath(texturePath) : undefined,
  ]);

  return {
    type: "Model",
    model: modelAsset?.contentType === "json" ? modelAsset.rawJson : undefined,
    texture: textureBytes ? Array.from(textureBytes) : undefined,
  };
}

// The base game code falls back to the same path as the model, but with .png instead of .blockymodel.
function resolveWithFallbackTexture(
  texturePath: string | undefined,
  modelPath: string | undefined,
): string | undefined {
  return (
    texturePath ??
    (modelPath?.toLowerCase().endsWith(".blockymodel")
      ? modelPath.replace(/\.blockymodel$/i, ".png")
      : undefined)
  );
}

function readDocumentJson(document: vscode.TextDocument): Record<string, unknown> | undefined {
  try {
    return JSON.parse(document.getText()) as Record<string, unknown>;
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
