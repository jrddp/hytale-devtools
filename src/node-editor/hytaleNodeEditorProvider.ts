import * as vscode from "vscode";
import { LOGGER, workspaceRuntime } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import {
  createEmptyNodeEditorClipboardSelection,
  type NodeEditorClipboardSelection,
} from "../shared/node-editor/clipboardTypes";
import type { AssetDocumentShape } from "../shared/node-editor/assetTypes";
import { parseAssetDocumentToGraphDocument, serializeGraphDocument } from "../shared/node-editor/graphDocument";
import {
  invertNodeEditorGraphEdit,
} from "../shared/node-editor/graphEditUtils";
import { type NodeEditorGraphEdit } from "../shared/node-editor/graphTypes";
import {
  type ActionType,
  type ExtensionToWebviewMessage,
  type NodeEditorGraphEditMessage,
  type NodeEditorControlScheme,
  type NodeEditorDocumentEditKind,
  type NodeEditorPlatform,
  type WebviewToExtensionMessage,
} from "../shared/node-editor/messageTypes";
import { isObject } from "../shared/typeUtils";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";
import { HytaleNodeDocument } from "./hytaleNodeDocument";

const VIEW_TYPE = "hytale-devtools.hytaleNodeEditor";
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
        void provider.triggerQuickActionByCommandId(
          getActionTypeFromCommandId(commandId) as ActionType | "go-to-root",
        );
      }),
  );

  return vscode.Disposable.from(providerRegistration, provider, ...quickActionCommandRegistrations);
}

class HytaleNodeEditorProvider implements vscode.CustomEditorProvider<HytaleNodeDocument> {
  private readonly onDidChangeCustomDocumentEmitter =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<HytaleNodeDocument>>();
  public readonly onDidChangeCustomDocument = this.onDidChangeCustomDocumentEmitter.event;

  private readonly webviewPanelsByDocumentUri = new Map<string, Set<vscode.WebviewPanel>>();
  private activeDocumentUri: string | undefined;
  private copiedSelection: NodeEditorClipboardSelection = createEmptyNodeEditorClipboardSelection();
  private selectionSubscription: vscode.Disposable | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.selectionSubscription = vscode.window.onDidChangeTextEditorSelection(event => {
      const uri = event.textEditor.document.uri.toString();
      const selection = event.selections[0];
      if (selection) {
        const panels = this.webviewPanelsByDocumentUri.get(uri);
        const payload: ExtensionToWebviewMessage = {
          type: "action",
          request: { type: "reveal-selection", selection },
        };
        for (const panel of panels ?? []) {
          void panel.webview.postMessage(payload);
        }
      }
    });
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<HytaleNodeDocument> {
    const sourceUri = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    const { documentRoot, eol } = await readDocumentRootFromUri(sourceUri);
    const workspaceContext = workspaceRuntime.resolveWorkspaceContext(uri.fsPath);
    if (!workspaceContext) {
      throw new Error(`Workspace context could not be resolved for path ${uri.fsPath}.`);
    }

    return new HytaleNodeDocument(
      uri,
      parseAssetDocumentToGraphDocument(documentRoot, workspaceContext),
      eol,
    );
  }

  public async resolveCustomEditor(
    document: HytaleNodeDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const documentUri = document.uri.toString();
      const documentPath = document.uri.fsPath;
      this.getPanelsForDocument(documentUri).add(webviewPanel);

      if (webviewPanel.active) {
        this.activeDocumentUri = documentUri;
      }

      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          resolveWebviewMediaRoot(this.context.extensionUri, "hytaleNodeEditor"),
        ],
      };

      webviewPanel.webview.html = buildViteWebviewHtml({
        webview: webviewPanel.webview,
        extensionUri: this.context.extensionUri,
        mediaDirectoryName: "hytaleNodeEditor",
        title: "Hytale Node Editor",
      });

      const sendBootstrap = () => {
        const workspaceContext = workspaceRuntime.resolveWorkspaceContext(documentPath);
        if (!workspaceContext) {
          void this.postError(
            webviewPanel.webview,
            `Workspace context could not be resolved for path ${documentPath}.`,
          );
          return;
        }
        const payload: ExtensionToWebviewMessage = {
          type: "bootstrap",
          workspaceContext,
          controlScheme: readNodeEditorControlScheme(),
          platform: readNodeEditorPlatform(),
          clipboard: this.copiedSelection,
          isDevelopment: this.context.extensionMode === vscode.ExtensionMode.Development,
        };
        void webviewPanel.webview.postMessage(payload);
      };

      const panelViewStateSubscription = webviewPanel.onDidChangeViewState(event => {
        if (event.webviewPanel.active) {
          this.activeDocumentUri = documentUri;
        } else if (this.activeDocumentUri === documentUri) {
          this.activeDocumentUri = undefined;
        }
      });

      webviewPanel.onDidDispose(() => {
        panelViewStateSubscription.dispose();
        this.removePanelForDocument(documentUri, webviewPanel);
        if (this.activeDocumentUri === documentUri) {
          this.activeDocumentUri = undefined;
        }
      });

      webviewPanel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        LOGGER.info(`Node editor message received: ${message.type}`);
        switch (message.type) {
          case "ready":
            sendBootstrap();
            void this.postDocumentUpdate(document);
            return;
          case "edit":
            void this.applyWebviewEdit(document, message, webviewPanel.webview);
            return;
          case "clipboard":
            void this.updateClipboard(message.clipboard);
            return;
          case "openRawJson":
            void this.openRawJsonInTextEditor();
            return;
          case "openKeybindings":
            void this.openNodeEditorKeybindings(message.query);
            return;
          case "update-setting":
            void this.updateNodeEditorSetting(message, webviewPanel.webview);
            return;
          case "autocompleteRequest":
            LOGGER.info(`Autocomplete request received for field ${message.fieldId}`);
            void this.autocompleteRequest(message, webviewPanel.webview);
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

  public async saveCustomDocument(
    document: HytaleNodeDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await writeDocumentRootToUri(document.uri, serializeGraphDocument(document.graphDocument), document.eol);
  }

  public async saveCustomDocumentAs(
    document: HytaleNodeDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await writeDocumentRootToUri(destination, serializeGraphDocument(document.graphDocument), document.eol);
  }

  public async revertCustomDocument(
    document: HytaleNodeDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const { documentRoot, eol } = await readDocumentRootFromUri(document.uri);
    const workspaceContext = workspaceRuntime.resolveWorkspaceContext(document.uri.fsPath);
    if (!workspaceContext) {
      throw new Error(`Workspace context could not be resolved for path ${document.uri.fsPath}.`);
    }
    document.replaceGraphDocument(parseAssetDocumentToGraphDocument(documentRoot, workspaceContext), eol);
    await this.postDocumentUpdate(document);
  }

  public async backupCustomDocument(
    document: HytaleNodeDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await writeDocumentRootToUri(
      context.destination,
      serializeGraphDocument(document.graphDocument),
      document.eol,
    );

    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination),
    };
  }

  public dispose(): void {
    this.selectionSubscription?.dispose();
    this.selectionSubscription = undefined;
    this.onDidChangeCustomDocumentEmitter.dispose();
  }

  public async triggerQuickActionByCommandId(
    actionType: ActionType | "go-to-root",
  ): Promise<void> {
    const targetPanel = this.resolveTargetWebviewPanel();
    if (!targetPanel) {
      return;
    }

    if (actionType === "go-to-root") {
      actionType = "reveal-node";
    }

    const allowEditableTarget = actionType === "search-nodes";

    await targetPanel.webview.postMessage({
      type: "action",
      request: { type: actionType },
      allowEditableTarget,
    });
  }

  private getPanelsForDocument(documentUri: string): Set<vscode.WebviewPanel> {
    let panels = this.webviewPanelsByDocumentUri.get(documentUri);
    if (!panels) {
      panels = new Set();
      this.webviewPanelsByDocumentUri.set(documentUri, panels);
    }
    return panels;
  }

  private removePanelForDocument(documentUri: string, panel: vscode.WebviewPanel): void {
    const panels = this.webviewPanelsByDocumentUri.get(documentUri);
    if (!panels) {
      return;
    }

    panels.delete(panel);
    if (panels.size === 0) {
      this.webviewPanelsByDocumentUri.delete(documentUri);
    }
  }

  private resolveTargetWebviewPanel(): vscode.WebviewPanel | undefined {
    const activePanels = this.activeDocumentUri
      ? this.webviewPanelsByDocumentUri.get(this.activeDocumentUri)
      : undefined;
    if (activePanels) {
      for (const panel of activePanels) {
        return panel;
      }
    }

    for (const panels of this.webviewPanelsByDocumentUri.values()) {
      for (const panel of panels) {
        if (panel.visible) {
          return panel;
        }
      }
    }

    for (const panels of this.webviewPanelsByDocumentUri.values()) {
      for (const panel of panels) {
        return panel;
      }
    }

    return undefined;
  }

  private async postDocumentUpdate(
    document: HytaleNodeDocument,
    acknowledgedClientEditId?: number,
    appliedEdit?: NodeEditorGraphEdit,
  ): Promise<void> {
    const payload: ExtensionToWebviewMessage = {
      type: "update",
      graphDocument: document.graphDocument,
      version: document.version,
      documentPath: document.uri.fsPath,
      acknowledgedClientEditId,
      appliedEdit,
    };

    const panels = this.webviewPanelsByDocumentUri.get(document.uri.toString());
    await Promise.all(Array.from(panels ?? [], panel => panel.webview.postMessage(payload)));
  }

  private async applyWebviewEdit(
    document: HytaleNodeDocument,
    message: Extract<WebviewToExtensionMessage, { type: "edit" }>,
    webview: vscode.Webview,
  ): Promise<void> {
    if (
      typeof message.sourceVersion === "number" &&
      message.sourceVersion !== document.version
    ) {
      LOGGER.error("Version mismatch detected when applying edit from node editor.");
      await this.postError(webview, "The file changed in another editor. Please retry.");
      await this.postDocumentUpdate(document);
      return;
    }

    if (isGraphEditMessage(message)) {
      const edit = graphEditMessageToGraphEdit(message);
      const undoEdit = invertNodeEditorGraphEdit(edit);

      document.applyGraphEdit(edit);
      this.onDidChangeCustomDocumentEmitter.fire({
        document,
        undo: async () => {
          document.applyGraphEdit(undoEdit);
          await this.postDocumentUpdate(document, undefined, undoEdit);
        },
        redo: async () => {
          document.applyGraphEdit(edit);
          await this.postDocumentUpdate(document, undefined, edit);
        },
      });
      await this.postDocumentUpdate(document, message.clientEditId, edit);
      return;
    }

    document.replaceGraphDocument(message.afterDocument, document.eol);
    this.onDidChangeCustomDocumentEmitter.fire({
      document,
      undo: async () => {
        document.replaceGraphDocument(message.beforeDocument, document.eol);
        await this.postDocumentUpdate(document);
      },
      redo: async () => {
        document.replaceGraphDocument(message.afterDocument, document.eol);
        await this.postDocumentUpdate(document);
      },
    });
    await this.postDocumentUpdate(document, message.clientEditId);
  }

  private async openRawJsonInTextEditor(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.reopenTextEditor");
  }

  private async openNodeEditorKeybindings(query: string | undefined): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openGlobalKeybindings",
      query ?? "Hytale Node Editor",
    );
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

  private async autocompleteRequest(
    message: Extract<WebviewToExtensionMessage, { type: "autocompleteRequest" }>,
    webview: vscode.Webview,
  ): Promise<void> {
    const matches = getValuesByIndexReference(message.symbolLookup);
    const payload: ExtensionToWebviewMessage = {
      type: "autocompletionValues",
      fieldId: message.fieldId,
      values: matches,
    };
    await webview.postMessage(payload);
  }

  private async updateClipboard(clipboard: NodeEditorClipboardSelection): Promise<void> {
    this.copiedSelection = clipboard;

    const payload: ExtensionToWebviewMessage = {
      type: "clipboard",
      clipboard: this.copiedSelection,
    };

    const allPanels = Array.from(this.webviewPanelsByDocumentUri.values()).flatMap(panels =>
      Array.from(panels),
    );
    await Promise.all(allPanels.map(panel => panel.webview.postMessage(payload)));
  }

  private async postError(webview: vscode.Webview, message: string): Promise<void> {
    const payload: ExtensionToWebviewMessage = {
      type: "error",
      message,
    };
    await webview.postMessage(payload);
  }
}

async function readDocumentRootFromUri(
  uri: vscode.Uri,
): Promise<{ documentRoot: AssetDocumentShape; eol: "\n" | "\r\n" }> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = stripBom(Buffer.from(bytes).toString("utf8"));
  const parsed = JSON.parse(text) as unknown;
  if (!isObject(parsed)) {
    throw new Error("Document must be a JSON object.");
  }

  return {
    documentRoot: parsed as AssetDocumentShape,
    eol: detectTextEol(text),
  };
}

async function writeDocumentRootToUri(
  uri: vscode.Uri,
  documentRoot: AssetDocumentShape,
  eol: "\n" | "\r\n",
): Promise<void> {
  const normalizedText = normalizeTextEol(JSON.stringify(documentRoot, null, "\t"), eol);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(normalizedText, "utf8"));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectTextEol(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeTextEol(text: string, eol: "\n" | "\r\n"): string {
  return text.replace(/\r\n|\r|\n/g, eol);
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
  const packageJson = context.extension.packageJSON as any;
  if (!isObject(packageJson)) {
    LOGGER.error("Commands unable to be parsed from package.json.");
    return [];
  }

  const commands = (packageJson.contributes as any)?.commands ?? [];

  if (!commands) {
    LOGGER.warn("No commands found in package.json contributes.");
    return [];
  }

  const commandIds = commands
    .map((command: any) => command.command)
    .filter(
      (commandId: string) => !!commandId?.startsWith(NODE_EDITOR_QUICK_ACTION_COMMAND_PREFIX),
    );
  return commandIds;
}

function getActionTypeFromCommandId(commandId: string): string | undefined {
  if (commandId.startsWith(NODE_EDITOR_QUICK_ACTION_COMMAND_PREFIX)) {
    return commandId.slice(NODE_EDITOR_QUICK_ACTION_COMMAND_PREFIX.length);
  }

  return undefined;
}

function isGraphEditKind(kind: NodeEditorDocumentEditKind): kind is NodeEditorGraphEdit["kind"] {
  return (
    kind === "nodes-moved" ||
    kind === "node-renamed" ||
    kind === "node-resized" ||
    kind === "node-properties-updated"
  );
}

function isGraphEditMessage(
  message: Extract<WebviewToExtensionMessage, { type: "edit" }>,
): message is NodeEditorGraphEditMessage {
  return isGraphEditKind(message.kind);
}

function graphEditMessageToGraphEdit(message: NodeEditorGraphEditMessage): NodeEditorGraphEdit {
  switch (message.kind) {
    case "nodes-moved":
      return {
        kind: message.kind,
        changes: message.changes,
      };
    case "node-renamed":
      return {
        kind: message.kind,
        changes: message.changes,
      };
    case "node-resized":
      return {
        kind: message.kind,
        changes: message.changes,
      };
    case "node-properties-updated":
      return {
        kind: message.kind,
        propertyChanges: message.propertyChanges,
        resizeChanges: message.resizeChanges,
      };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
