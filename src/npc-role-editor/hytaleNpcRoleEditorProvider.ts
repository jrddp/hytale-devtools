import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { assetCacheRuntime, indexes, LOGGER } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
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
import { HytaleNpcRoleDocument } from "./hytaleNpcRoleDocument";
import {
  filterNpcRoleReferenceNamesFromPaths,
  getNpcRoleReferenceName,
  isVariantReferenceRoleType,
  parseNpcRoleTypeFromText,
} from "./variantReferenceResolver";

const VIEW_TYPE = "hytale-devtools.hytaleNpcRoleEditor";
const NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";
const WORKSPACE_NPC_ROLE_GLOB = "**/Server/NPC/Roles/**/*.json";
const WORKSPACE_NPC_ROLE_EXCLUDE_GLOB = "**/{node_modules,.git,dist,build,.svelte-kit}/**";
const DEFAULT_EDIT_LABEL = "Edit NPC Role";

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
    provider,
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

type HytaleNpcRoleReplaceTextEdit = {
  kind: "replaceText";
  beforeText: string;
  afterText: string;
  beforeRevision: number;
  afterRevision: number;
  label: string;
};

class HytaleNpcRoleEditorProvider implements vscode.CustomEditorProvider<HytaleNpcRoleDocument> {
  private readonly onDidChangeCustomDocumentEmitter =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<HytaleNpcRoleDocument>>();
  public readonly onDidChangeCustomDocument = this.onDidChangeCustomDocumentEmitter.event;

  private readonly webviewPanelsByDocumentUri = new Map<string, Set<vscode.WebviewPanel>>();
  private activeDocumentUri: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public dispose(): void {
    this.onDidChangeCustomDocumentEmitter.dispose();
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<HytaleNpcRoleDocument> {
    const sourceUri = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    const { text, eol } = await readNpcRoleTextFromUri(sourceUri);
    return new HytaleNpcRoleDocument(uri, text, eol);
  }

  public async resolveCustomEditor(
    document: HytaleNpcRoleDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const documentUri = document.uri.toString();
      this.getPanelsForDocument(documentUri).add(webviewPanel);

      if (webviewPanel.active) {
        this.activeDocumentUri = documentUri;
      }

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

      webviewPanel.webview.onDidReceiveMessage((message: NpcRoleEditorWebviewToExtensionMessage) => {
        console.log(
          "[NPC Role Editor: extension received]",
          summarizeWebviewMessageForLog(message),
        );
        switch (message.type) {
          case "ready":
            void sendBootstrap().finally(() => {
              void this.postDocumentUpdate(document, webviewPanel.webview);
            });
            return;
          case "openRawJson":
            void this.openRawJsonInTextEditor();
            return;
          case "autocompleteRequest":
            void this.autocompleteRequest(message, document.uri, webviewPanel.webview);
            return;
          case "resolveVariantReference":
            void this.resolveVariantReference(message.referenceName, document.uri, webviewPanel.webview);
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

  public async saveCustomDocument(
    document: HytaleNpcRoleDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await writeNpcRoleTextToUri(document.uri, document.text, document.eol);
  }

  public async saveCustomDocumentAs(
    document: HytaleNpcRoleDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await writeNpcRoleTextToUri(destination, document.text, document.eol);
  }

  public async revertCustomDocument(
    document: HytaleNpcRoleDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const { text, eol } = await readNpcRoleTextFromUri(document.uri);
    document.replaceText(text, eol);
    await this.postDocumentUpdate(document);
  }

  public async backupCustomDocument(
    document: HytaleNpcRoleDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await writeNpcRoleTextToUri(context.destination, document.text, document.eol);

    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination),
    };
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
    document: HytaleNpcRoleDocument,
    targetWebview?: vscode.Webview,
  ): Promise<void> {
    const payload: NpcRoleEditorExtensionToWebviewMessage = {
      type: "update",
      documentPath: document.uri.fsPath,
      version: document.revision,
      text: document.text,
    };

    if (targetWebview) {
      await targetWebview.postMessage(payload);
      return;
    }

    const panels = this.webviewPanelsByDocumentUri.get(document.uri.toString());
    await Promise.all(Array.from(panels ?? [], panel => panel.webview.postMessage(payload)));
  }

  private async postError(webview: vscode.Webview, message: string): Promise<void> {
    const payload: NpcRoleEditorExtensionToWebviewMessage = {
      type: "error",
      message,
    };
    await webview.postMessage(payload);
  }

  public async postContextAction(message: NpcRoleEditorContextActionMessage): Promise<void> {
    const targetPanel = this.resolveTargetWebviewPanel();
    if (!targetPanel) {
      return;
    }

    await targetPanel.webview.postMessage(message);
  }

  private async autocompleteRequest(
    message: Extract<NpcRoleEditorWebviewToExtensionMessage, { type: "autocompleteRequest" }>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<void> {
    await webview.postMessage({
      type: "autocompletionValues",
      fieldId: message.fieldId,
      values: await this.getAutocompleteValues(message.symbolLookup, documentUri),
    } satisfies NpcRoleEditorExtensionToWebviewMessage);
  }

  private async getAutocompleteValues(
    symbolLookup: Extract<NpcRoleEditorWebviewToExtensionMessage, { type: "autocompleteRequest" }>["symbolLookup"],
    documentUri: vscode.Uri,
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

    candidatePaths.add(documentUri.fsPath);

    return filterNpcRoleReferenceNamesFromPaths(
      candidatePaths,
      symbolLookup.filter.npcRoleTypes,
    );
  }

  private async resolveVariantReference(
    referenceName: string,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<void> {
    const reference = await resolveVariantReferenceState(referenceName, documentUri);
    await webview.postMessage({
      type: "referenceUpdate",
      reference,
    } satisfies NpcRoleEditorExtensionToWebviewMessage);
  }

  private async openRawJsonInTextEditor(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.reopenTextEditor");
  }

  private async applyWebviewEdits(
    document: HytaleNpcRoleDocument,
    message: NpcRoleEditorApplyMessage,
    webview: vscode.Webview,
  ): Promise<void> {
    if (typeof message.text !== "string") {
      LOGGER.error("Unable to apply edit from NPC role editor. Message text was not a string.");
      return;
    }

    const afterText = normalizeTextEol(message.text, document.eol);
    if (afterText === document.text) {
      return;
    }

    if (message.sourceVersion !== document.revision) {
      LOGGER.error(
        `Version mismatch detected when applying edit from NPC role editor. label="${message.label}", sourceVersion=${message.sourceVersion}, currentRevision=${document.revision}`,
      );
      await this.postError(webview, "The file changed in another editor. Please retry.");
      await this.postDocumentUpdate(document);
      return;
    }

    const label = message.label.trim() || DEFAULT_EDIT_LABEL;
    const beforeText = document.text;
    const beforeRevision = document.revision;

    const edit: HytaleNpcRoleReplaceTextEdit = {
      kind: "replaceText",
      label,
      beforeText,
      afterText,
      beforeRevision,
      afterRevision: beforeRevision + 1,
    };

    document.replaceText(edit.afterText);
    this.onDidChangeCustomDocumentEmitter.fire({
      document,
      label: edit.label,
      undo: async () => {
        document.replaceText(edit.beforeText);
        await this.postDocumentUpdate(document);
      },
      redo: async () => {
        document.replaceText(edit.afterText);
        await this.postDocumentUpdate(document);
      },
    });
    await this.postDocumentUpdate(document);
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
  documentUri: vscode.Uri,
): Promise<NpcRoleEditorVariantReferenceState> {
  const trimmedReferenceName = referenceName.trim();
  if (!trimmedReferenceName) {
    return { status: "none" };
  }

  const currentDocumentReferenceName = getNpcRoleReferenceName(documentUri.fsPath);
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
      candidate.uri.fsPath !== documentUri.fsPath &&
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
    if (match.fsPath === documentUri.fsPath) {
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

async function readNpcRoleTextFromUri(
  uri: vscode.Uri,
): Promise<{ text: string; eol: vscode.EndOfLine }> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = stripBom(Buffer.from(bytes).toString("utf8"));
  return {
    text,
    eol: detectTextEol(text),
  };
}

async function writeNpcRoleTextToUri(
  uri: vscode.Uri,
  text: string,
  eol: vscode.EndOfLine,
): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(normalizeTextEol(text, eol), "utf8"));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectTextEol(text: string): vscode.EndOfLine {
  return text.includes("\r\n") ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF;
}

function normalizeTextEol(text: string, eol: vscode.EndOfLine): string {
  const targetEol = eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  return text.replace(/\r\n|\r|\n/g, targetEol);
}
