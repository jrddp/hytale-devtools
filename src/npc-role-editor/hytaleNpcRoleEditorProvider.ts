import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { LOGGER } from "../extension";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "../shared/npc-role-editor/descriptorTypes";
import type {
  NpcRoleEditorBootstrapMessage,
  NpcRoleEditorExtensionToWebviewMessage,
  NpcRoleEditorWebviewToExtensionMessage,
} from "../shared/npc-role-editor/messageTypes";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";
import { resolveDataRootDirFromContext, resolveDefaultSchemaDataRoot } from "../utils/hytalePaths";

const VIEW_TYPE = "hytale-devtools.hytaleNpcRoleEditor";
const NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";

export function registerHytaleNpcRoleEditorProvider(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const provider = new HytaleNpcRoleEditorProvider(context);
  return vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
    webviewOptions: {
      enableFindWidget: true,
    },
    supportsMultipleEditorsPerDocument: true,
  });
}

type LoadedNpcDescriptors = {
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
};

class HytaleNpcRoleEditorProvider implements vscode.CustomTextEditorProvider {
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

      webviewPanel.onDidDispose(() => {
        documentChangeSubscription.dispose();
      });

      webviewPanel.webview.onDidReceiveMessage((message: NpcRoleEditorWebviewToExtensionMessage) => {
        switch (message.type) {
          case "ready":
            void sendBootstrap().finally(() => {
              updateWebview();
            });
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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
