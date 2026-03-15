import * as vscode from "vscode";
import { LOGGER, workspaceRuntime } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import {
  createEmptyNodeEditorClipboardSelection,
  type NodeEditorClipboardSelection,
} from "../shared/node-editor/clipboardTypes";
import type {
  ActionType,
  ExtensionToWebviewMessage,
  NodeEditorControlScheme,
  NodeEditorPlatform,
  WebviewToExtensionMessage,
} from "../shared/node-editor/messageTypes";
import { isObject } from "../shared/typeUtils";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";

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

class HytaleNodeEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly webviewPanelsByDocumentUri = new Map<string, vscode.WebviewPanel>();
  private activeDocumentPath: string | undefined;
  private copiedSelection: NodeEditorClipboardSelection = createEmptyNodeEditorClipboardSelection();
  private selectionSubscription: vscode.Disposable | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Watch editor selection changes
    vscode.window.onDidChangeTextEditorSelection(event => {
      const uri = event.textEditor.document.uri.toString();
      const selection = event.selections[0];
      if (selection) {
        const webviewPanel = this.webviewPanelsByDocumentUri.get(uri);
        const payload: ExtensionToWebviewMessage = {
          type: "action",
          request: { type: "reveal-selection", selection },
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
          clipboard: this.copiedSelection,
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
      });

      webviewPanel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        LOGGER.info(`Message received: ${JSON.stringify(message, null, 2)}`);
        switch (message.type) {
          case "ready":
            sendBootstrap();
            updateWebview();
            return;
          case "apply":
            void this.applyWebviewEdits(document, message, webviewPanel.webview, updateWebview);
            return;
          case "clipboard":
            void this.updateClipboard(message.clipboard);
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
          case "autocompleteRequest":
            LOGGER.info(`Autocomplete request received for field ${message.fieldId}`);
            void this.autocompleteRequest(message, webviewPanel.webview);
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
    this.selectionSubscription?.dispose();
    this.selectionSubscription = undefined;
  }

  public async triggerQuickActionByCommandId(actionType: ActionType | "go-to-root", allowEditableTarget: boolean = false): Promise<void> {
    const targetPanel = this.resolveTargetWebviewPanel();
    if (!targetPanel) {
      return;
    }

    if (actionType === "go-to-root") {
      actionType = "reveal-node";
    }

    await targetPanel.webview.postMessage({
      type: "action",
      request: { type: actionType },
      allowEditableTarget,
    });
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

    // if (typeof message.sourceVersion === "number" && message.sourceVersion !== document.version) {
    //   LOGGER.error("Version mismatch detected when applying edit from node editor.");
    //   await this.postError(webview, "The file changed in another editor. Please retry.");
    //   updateWebview();
    //   return;
    // }

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

    await Promise.all(
      Array.from(this.webviewPanelsByDocumentUri.values(), panel => panel.webview.postMessage(payload)),
    );
  }

  private async postError(webview: vscode.Webview, message: string): Promise<void> {
    const payload: ExtensionToWebviewMessage = {
      type: "error",
      message,
    };
    await webview.postMessage(payload);
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
