import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { LOGGER } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "../shared/npc-role-editor/descriptorTypes";
import type {
  NpcRoleEditorApplyMessage,
  NpcRoleEditorBootstrapMessage,
  NpcRoleEditorContextActionMessage,
  NpcRoleEditorExtensionToWebviewMessage,
  NpcRoleEditorWebviewToExtensionMessage,
} from "../shared/npc-role-editor/messageTypes";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";
import { resolveDataRootDirFromContext, resolveDefaultSchemaDataRoot } from "../utils/hytalePaths";

const VIEW_TYPE = "hytale-devtools.hytaleNpcRoleEditor";
const NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";
let activeProvider: HytaleNpcRoleEditorProvider | null = null;

export function registerHytaleNpcRoleEditorProvider(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const provider = new HytaleNpcRoleEditorProvider(context);
  activeProvider = provider;

  const registration = vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
    webviewOptions: {
      enableFindWidget: true,
    },
    supportsMultipleEditorsPerDocument: true,
  });

  return vscode.Disposable.from(
    registration,
    new vscode.Disposable(() => {
      if (activeProvider === provider) {
        activeProvider = null;
      }
    }),
  );
}

export async function triggerNpcRoleEditorContextAction(
  action: NpcRoleEditorContextActionMessage["action"],
  context: unknown,
): Promise<void> {
  const parameterName =
    isRecord(context) && typeof context.parameterName === "string" ? context.parameterName : null;
  const fieldPath = isRecord(context) && typeof context.fieldPath === "string" ? context.fieldPath : null;

  if (!activeProvider) {
    return;
  }

  if (action !== "logFieldInstance" && !parameterName) {
    return;
  }

  if (action === "logFieldInstance" && !fieldPath) {
    return;
  }

  await activeProvider.postContextAction({
    type: "contextAction",
    action,
    parameterName: parameterName ?? undefined,
    fieldPath: fieldPath ?? undefined,
  });
}

type LoadedNpcDescriptors = {
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
};

class HytaleNpcRoleEditorProvider implements vscode.CustomTextEditorProvider {
  private activeWebviewPanel: vscode.WebviewPanel | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): void {
    try {
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          resolveWebviewMediaRoot(this.context.extensionUri, "hytaleNpcRoleEditor"),
        ],
      };

      webviewPanel.webview.html = buildViteWebviewHtml({
        webview: webviewPanel.webview,
        extensionUri: this.context.extensionUri,
        mediaDirectoryName: "hytaleNpcRoleEditor",
        title: "Hytale NPC Role Editor",
      });

      const sendBootstrap = async () => {
        try {
          const loadedDescriptors = this.loadNpcDescriptors();
          const payload: NpcRoleEditorBootstrapMessage = {
            type: "bootstrap",
            ...loadedDescriptors,
            isDevelopment: this.context.extensionMode === vscode.ExtensionMode.Development,
          };
          await webviewPanel.webview.postMessage(payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          LOGGER.error(`Unable to load NPC descriptors: ${message}`);
          await this.postError(webviewPanel.webview, message);
        }
      };

      const updateWebview = () => {
        void webviewPanel.webview.postMessage({
          type: "update",
          documentPath: document.uri.fsPath,
          version: document.version,
          text: document.getText(),
        } satisfies NpcRoleEditorExtensionToWebviewMessage);
      };

      const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() === document.uri.toString()) {
          updateWebview();
        }
      });

      const viewStateSubscription = webviewPanel.onDidChangeViewState(event => {
        if (event.webviewPanel.active) {
          this.activeWebviewPanel = event.webviewPanel;
        }
      });

      if (webviewPanel.active) {
        this.activeWebviewPanel = webviewPanel;
      }

      webviewPanel.onDidDispose(() => {
        documentChangeSubscription.dispose();
        viewStateSubscription.dispose();
        if (this.activeWebviewPanel === webviewPanel) {
          this.activeWebviewPanel = null;
        }
      });

      webviewPanel.webview.onDidReceiveMessage((message: NpcRoleEditorWebviewToExtensionMessage) => {
        console.log(
          "[NPC Role Editor: extension received]",
          summarizeWebviewMessageForLog(message),
        );
        switch (message.type) {
          case "ready":
            void sendBootstrap().finally(() => {
              updateWebview();
            });
            return;
          case "openRawJson":
            void this.openRawJsonInTextEditor(document, webviewPanel);
            return;
          case "autocompleteRequest":
            void this.autocompleteRequest(message, webviewPanel.webview);
            return;
          case "apply":
            void this.applyWebviewEdits(document, message, webviewPanel.webview);
            return;
          default:
            return;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to resolve Hytale NPC Role custom editor:", message);
      void vscode.window.showErrorMessage(`Hytale NPC Role editor failed to load: ${message}`);
      webviewPanel.webview.html = `<html><body><h3>Hytale NPC Role editor failed to load</h3><pre>${escapeHtml(message)}</pre></body></html>`;
    }
  }

  private loadNpcDescriptors(): LoadedNpcDescriptors {
    const activeDataRoot = resolveDataRootDirFromContext(this.context);
    const defaultDataRoot = resolveDefaultSchemaDataRoot(this.context.extensionPath);
    const candidates: Array<{ descriptorPath: string; descriptorSource: NpcDescriptorSource }> = [
      {
        descriptorPath: path.join(activeDataRoot.rootPath, NPC_DESCRIPTOR_FILE_NAME),
        descriptorSource: activeDataRoot.source,
      },
    ];

    if (path.normalize(defaultDataRoot) !== path.normalize(activeDataRoot.rootPath)) {
      candidates.push({
        descriptorPath: path.join(defaultDataRoot, NPC_DESCRIPTOR_FILE_NAME),
        descriptorSource: "default-data",
      });
    }

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate.descriptorPath)) {
        continue;
      }

      const parsed = JSON.parse(fs.readFileSync(candidate.descriptorPath, "utf8"));
      if (!Array.isArray(parsed)) {
        throw new Error(`NPC descriptor file at ${candidate.descriptorPath} was not an array.`);
      }

      return {
        descriptors: parsed as NpcDescriptorDocument,
        descriptorPath: candidate.descriptorPath,
        descriptorSource: candidate.descriptorSource,
      };
    }

    throw new Error(
      `NPC descriptor export was not found in ${candidates.map(candidate => candidate.descriptorPath).join(" or ")}`,
    );
  }

  private async postError(webview: vscode.Webview, message: string): Promise<void> {
    const payload: NpcRoleEditorExtensionToWebviewMessage = {
      type: "error",
      message,
    };
    await webview.postMessage(payload);
  }

  public async postContextAction(message: NpcRoleEditorContextActionMessage): Promise<void> {
    if (!this.activeWebviewPanel) {
      return;
    }

    await this.activeWebviewPanel.webview.postMessage(message);
  }

  private async autocompleteRequest(
    message: Extract<NpcRoleEditorWebviewToExtensionMessage, { type: "autocompleteRequest" }>,
    webview: vscode.Webview,
  ): Promise<void> {
    await webview.postMessage({
      type: "autocompletionValues",
      fieldId: message.fieldId,
      values: getValuesByIndexReference(message.symbolLookup),
    } satisfies NpcRoleEditorExtensionToWebviewMessage);
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
    message: NpcRoleEditorApplyMessage,
    webview: vscode.Webview,
  ): Promise<void> {
    if (typeof message.text !== "string") {
      LOGGER.error("Unable to apply edit from NPC role editor. Message text was not a string.");
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

function summarizeWebviewMessageForLog(message: NpcRoleEditorWebviewToExtensionMessage) {
  switch (message.type) {
    case "apply":
      return {
        ...message,
        textLength: message.text.length,
        textPreview: message.text.slice(0, 200),
      };
    default:
      return message;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
