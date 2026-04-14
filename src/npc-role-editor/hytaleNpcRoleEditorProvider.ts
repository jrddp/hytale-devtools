import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { assetCacheRuntime, indexes, LOGGER } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import {
  filterNpcRoleReferenceNamesFromPaths,
  getNpcRoleReferenceName,
  isVariantReferenceRoleType,
  parseNpcRoleTypeFromText,
  VARIANT_REFERENCE_ROLE_TYPES,
} from "./variantReferenceResolver";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "../shared/npc-role-editor/descriptorTypes";
import type {
  NpcRoleEditorApplyMessage,
  NpcRoleEditorBootstrapMessage,
  NpcRoleEditorContextActionMessage,
  NpcRoleEditorExtensionToWebviewMessage,
  NpcRoleEditorVariantReferenceState,
  NpcRoleEditorWebviewToExtensionMessage,
} from "../shared/npc-role-editor/messageTypes";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";
import { resolveDataRootDirFromContext, resolveDefaultSchemaDataRoot } from "../utils/hytalePaths";

const VIEW_TYPE = "hytale-devtools.hytaleNpcRoleEditor";
const NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";
const WORKSPACE_NPC_ROLE_GLOB = "**/Server/NPC/Roles/**/*.json";
const WORKSPACE_NPC_ROLE_EXCLUDE_GLOB = "**/{node_modules,.git,dist,build,.svelte-kit}/**";
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

  if (
    action !== "logFieldInstance" &&
    action !== "deleteField" &&
    !parameterName
  ) {
    return;
  }

  if ((action === "logFieldInstance" || action === "deleteField") && !fieldPath) {
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
            void this.autocompleteRequest(message, document, webviewPanel.webview);
            return;
          case "resolveVariantReference":
            void this.resolveVariantReference(message.referenceName, document, webviewPanel.webview);
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
    document: vscode.TextDocument,
    webview: vscode.Webview,
  ): Promise<void> {
    await webview.postMessage({
      type: "autocompletionValues",
      fieldId: message.fieldId,
      values: await this.getAutocompleteValues(message.symbolLookup, document),
    } satisfies NpcRoleEditorExtensionToWebviewMessage);
  }

  private async getAutocompleteValues(
    symbolLookup: Extract<NpcRoleEditorWebviewToExtensionMessage, { type: "autocompleteRequest" }>["symbolLookup"],
    document: vscode.TextDocument,
  ): Promise<string[]> {
    if (
      symbolLookup.indexKind !== "registeredAssets" ||
      symbolLookup.key !== "NPCRole" ||
      !symbolLookup.filter?.npcRoleTypes?.length
    ) {
      return getValuesByIndexReference(symbolLookup);
    }

    const candidatePaths = new Set<string>();
    const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
    if (registeredShard?.indexKind === "registeredAssets") {
      for (const key of Object.keys((registeredShard as RegisteredAssetsIndexShard).values)) {
        candidatePaths.add(key);
      }
    }

    for (const openDocument of vscode.workspace.textDocuments) {
      if (openDocument.uri.scheme !== "file" || !openDocument.fileName.endsWith(".json")) {
        continue;
      }

      candidatePaths.add(openDocument.uri.fsPath);
    }

    const workspaceRoleUris = await vscode.workspace.findFiles(
      WORKSPACE_NPC_ROLE_GLOB,
      WORKSPACE_NPC_ROLE_EXCLUDE_GLOB,
      5000,
    );
    for (const roleUri of workspaceRoleUris) {
      candidatePaths.add(roleUri.fsPath);
    }

    candidatePaths.add(document.uri.fsPath);

    return filterNpcRoleReferenceNamesFromPaths(
      candidatePaths,
      symbolLookup.filter.npcRoleTypes,
    );
  }

  private async resolveVariantReference(
    referenceName: string,
    document: vscode.TextDocument,
    webview: vscode.Webview,
  ): Promise<void> {
    const reference = await resolveVariantReferenceState(referenceName, document);
    await webview.postMessage({
      type: "referenceUpdate",
      reference,
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

async function resolveVariantReferenceState(
  referenceName: string,
  document: vscode.TextDocument,
): Promise<NpcRoleEditorVariantReferenceState> {
  const trimmedReferenceName = referenceName.trim();
  if (!trimmedReferenceName) {
    return { status: "none" };
  }

  const currentDocumentReferenceName = getNpcRoleReferenceName(document.uri.fsPath);
  if (trimmedReferenceName === currentDocumentReferenceName) {
    return {
      status: "error",
      referenceName: trimmedReferenceName,
      message: "Variants cannot reference themselves.",
    };
  }

  const openDocumentMatch = vscode.workspace.textDocuments.find(candidate => {
    return (
      candidate.uri.scheme === "file" &&
      candidate.uri.fsPath !== document.uri.fsPath &&
      getNpcRoleReferenceName(candidate.uri.fsPath) === trimmedReferenceName
    );
  });

  if (openDocumentMatch) {
    const parsedType = parseNpcRoleTypeFromText(openDocumentMatch.getText());
    if (isVariantReferenceRoleType(parsedType)) {
      return {
        status: "loaded",
        referenceName: trimmedReferenceName,
        resolvedPath: openDocumentMatch.uri.fsPath,
        text: openDocumentMatch.getText(),
      };
    }
  }

  const workspaceMatches = await vscode.workspace.findFiles(
    `**/${trimmedReferenceName}.json`,
    WORKSPACE_NPC_ROLE_EXCLUDE_GLOB,
    50,
  );

  for (const match of workspaceMatches) {
    if (match.fsPath === document.uri.fsPath) {
      continue;
    }

    try {
      const text = fs.readFileSync(match.fsPath, "utf8");
      const parsedType = parseNpcRoleTypeFromText(text);
      if (!isVariantReferenceRoleType(parsedType)) {
        continue;
      }

      return {
        status: "loaded",
        referenceName: trimmedReferenceName,
        resolvedPath: match.fsPath,
        text,
      };
    } catch (error) {
      return {
        status: "error",
        referenceName: trimmedReferenceName,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
  if (registeredShard?.indexKind === "registeredAssets") {
    for (const [assetName, metadata] of Object.entries((registeredShard as RegisteredAssetsIndexShard).values)) {
      if (getNpcRoleReferenceName(assetName) !== trimmedReferenceName) {
        continue;
      }

      if (!metadata.sourcedFromFile) {
        continue;
      }

      try {
        const bytes = await assetCacheRuntime.readAssetBytesByPath(metadata.sourcedFromFile);
        if (!bytes) {
          continue;
        }

        const text = bytes.toString("utf8");
        const parsedType = parseNpcRoleTypeFromText(text);
        if (!isVariantReferenceRoleType(parsedType)) {
          continue;
        }

        return {
          status: "loaded",
          referenceName: trimmedReferenceName,
          resolvedPath: metadata.sourcedFromFile,
          text,
        };
      } catch (error) {
        return {
          status: "error",
          referenceName: trimmedReferenceName,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    status: "missing",
    referenceName: trimmedReferenceName,
  };
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
