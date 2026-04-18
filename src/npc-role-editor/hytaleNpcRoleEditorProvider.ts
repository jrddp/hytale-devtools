import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { assetCacheRuntime, indexes, LOGGER, workspaceRuntime } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import type { ModelPreviewState } from "../shared/modelPreviewTypes";
import {
  createEmptyNodeEditorClipboardSelection,
  type NodeEditorClipboardSelection,
} from "../shared/node-editor/clipboardTypes";
import { graphEditMessageToGraphEdit } from "../shared/node-editor/graphEditMessages";
import { invertNodeEditorGraphEdit } from "../shared/node-editor/graphEditUtils";
import type { NodeEditorGraphEdit } from "../shared/node-editor/graphTypes";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "../shared/npc-role-editor/descriptorTypes";
import type {
  NpcRoleEditorApplyMessage,
  NpcRoleEditorBootstrapMessage,
  NpcRoleEditorContextActionMessage,
  NpcRoleEditorExtensionToWebviewMessage,
  NpcRoleEditorGraphEditMessage,
  NpcRoleEditorPreviewUpdateMessage,
  NpcRoleEditorVariantReferenceState,
  NpcRoleEditorWebviewToExtensionMessage,
} from "../shared/npc-role-editor/messageTypes";
import type {
  NodeEditorControlScheme,
  NodeEditorPlatform,
} from "../shared/node-editor/messageTypes";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";
import { resolveDataRootDirFromContext, resolveDefaultSchemaDataRoot } from "../utils/hytalePaths";
import { HytaleNpcRoleDocument } from "./hytaleNpcRoleDocument";
import { resolveNpcAppearancePreview } from "./appearancePreviewRuntime";
import { applyNpcGraphEditToDocument } from "./graphEditRuntime";
import {
  buildVariantAppearancePreviewContext,
  filterNpcRoleReferenceNamesFromPaths,
  getNpcRoleReferenceName,
  isVariantReferenceRoleType,
  matchesNpcRoleReferenceCandidate,
  parseLoadedVariantReferenceDocument,
  parseNpcRoleTypeFromText,
  type LoadedVariantReferenceDocument,
  type VariantReferenceDocumentLoadResult,
} from "./variantReferenceResolver";

const VIEW_TYPE = "hytale-devtools.hytaleNpcRoleEditor";
const NPC_DESCRIPTOR_FILE_NAME = "npc_descriptors.json";
const WORKSPACE_NPC_ROLE_GLOB = "**/Server/NPC/Roles/**/*.json";
const WORKSPACE_NPC_ROLE_EXCLUDE_GLOB = "**/{node_modules,.git,dist,build,.svelte-kit}/**";
const DEFAULT_EDIT_LABEL = "Edit NPC Role";
const EXTENSION_CONFIG_NAMESPACE = "hytale-devtools";
const NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY = "nodeEditor.controlScheme";
const DEFAULT_NODE_EDITOR_CONTROL_SCHEME: NodeEditorControlScheme = "mouse";

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

type HytaleNpcRoleGraphEdit = {
  kind: "graphSectionEdit";
  fieldPath: string;
  label: string;
  edit: NodeEditorGraphEdit;
  undoEdit: NodeEditorGraphEdit;
  beforeRevision: number;
  afterRevision: number;
  acknowledgedClientEditId: number;
};

class HytaleNpcRoleEditorProvider implements vscode.CustomEditorProvider<HytaleNpcRoleDocument> {
  private readonly onDidChangeCustomDocumentEmitter =
    new vscode.EventEmitter<vscode.CustomDocumentEditEvent<HytaleNpcRoleDocument>>();
  public readonly onDidChangeCustomDocument = this.onDidChangeCustomDocumentEmitter.event;

  private readonly webviewPanelsByDocumentUri = new Map<string, Set<vscode.WebviewPanel>>();
  private activeDocumentUri: string | undefined;
  private copiedSelection: NodeEditorClipboardSelection = createEmptyNodeEditorClipboardSelection();

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
      let isDisposed = false;
      let previewResolutionVersion = 0;
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
            nodeEditorControlScheme: readNodeEditorControlScheme(),
            nodeEditorPlatform: readNodeEditorPlatform(),
            nodeEditorClipboard: this.copiedSelection,
            npcBehaviorGraphContexts: {
              Instructions: workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot(
                "NPC Behavior",
                "Instructions",
              ) ?? undefined,
              Instruction: workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot(
                "NPC Behavior",
                "Instruction",
              ) ?? undefined,
              Sensor: workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot(
                "NPC Behavior",
                "Sensor",
              ) ?? undefined,
            },
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
        isDisposed = true;
        panelViewStateSubscription.dispose();
        this.removePanelForDocument(documentUri, webviewPanel);
        if (this.activeDocumentUri === documentUri) {
          this.activeDocumentUri = undefined;
        }
      });

      const postResolvedPreview = async (previewPromise: Promise<ModelPreviewState>) => {
        const resolutionVersion = ++previewResolutionVersion;
        const preview = await previewPromise;
        if (isDisposed || resolutionVersion !== previewResolutionVersion) {
          return;
        }

        await webviewPanel.webview.postMessage({
          type: "previewUpdate",
          preview,
        } satisfies NpcRoleEditorPreviewUpdateMessage);
      };

      const sendResolvedAppearancePreview = async (assetName: string | undefined) => {
        if (isDisposed) {
          return;
        }

        if (!assetCacheRuntime.isReady) {
          await webviewPanel.webview.postMessage({
            type: "previewUpdate",
            preview: assetName ? { type: "none", loading: true } : { type: "none" },
          } satisfies NpcRoleEditorPreviewUpdateMessage);

          if (!assetName) {
            return;
          }

          void assetCacheRuntime.ready.then(() => {
            if (!isDisposed && assetCacheRuntime.isReady) {
              void sendResolvedAppearancePreview(assetName);
            }
          });
          return;
        }

        const modelAssetIndex = indexes.get("registeredAssets")?.get("ModelAsset");
        await postResolvedPreview(
          resolveNpcAppearancePreview(
            assetName,
            assetCacheRuntime,
            modelAssetIndex?.indexKind === "registeredAssets" ? modelAssetIndex : undefined,
          ),
        );
      };

      webviewPanel.webview.onDidReceiveMessage((message: NpcRoleEditorWebviewToExtensionMessage) => {
        switch (message.type) {
          case "ready":
            void sendBootstrap().finally(() => {
              void this.postDocumentUpdate(document, webviewPanel.webview);
            });
            return;
          case "openRawJson":
            void this.openRawJsonInTextEditor();
            return;
          case "clipboard":
            void this.updateClipboard(message.clipboard);
            return;
          case "openKeybindings":
            void this.openNodeEditorKeybindings(message.query);
            return;
          case "update-setting":
            void this.updateNodeEditorSetting(message, webviewPanel.webview);
            return;
          case "autocompleteRequest":
            void this.autocompleteRequest(message, document.uri, webviewPanel.webview);
            return;
          case "resolveVariantReference":
            void this.resolveVariantReference(message.referenceName, document.uri, webviewPanel.webview);
            return;
          case "resolveAppearancePreview":
            void sendResolvedAppearancePreview(message.assetName);
            return;
          case "apply":
            void this.applyWebviewEdits(document, message, webviewPanel.webview);
            return;
          case "edit":
            void this.applyGraphWebviewEdit(document, message, webviewPanel.webview);
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

  private async postGraphUpdate(
    document: HytaleNpcRoleDocument,
    {
      fieldPath,
      acknowledgedClientEditId,
      appliedEdit,
      targetWebview,
    }: {
      fieldPath: string;
      acknowledgedClientEditId?: number;
      appliedEdit?: NodeEditorGraphEdit;
      targetWebview?: vscode.Webview;
    },
  ): Promise<void> {
    const payload: NpcRoleEditorExtensionToWebviewMessage = {
      type: "graphUpdate",
      documentPath: document.uri.fsPath,
      version: document.revision,
      text: document.text,
      fieldPath,
      acknowledgedClientEditId,
      appliedEdit,
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

  private async updateClipboard(clipboard: NodeEditorClipboardSelection): Promise<void> {
    this.copiedSelection = clipboard;

    const payload: NpcRoleEditorExtensionToWebviewMessage = {
      type: "clipboard",
      clipboard: this.copiedSelection,
    };

    const allPanels = Array.from(this.webviewPanelsByDocumentUri.values()).flatMap(panels =>
      Array.from(panels),
    );
    await Promise.all(allPanels.map(panel => panel.webview.postMessage(payload)));
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

  private async openNodeEditorKeybindings(query: string | undefined): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openGlobalKeybindings",
      query ?? "Hytale Node Editor",
    );
  }

  private async updateNodeEditorSetting(
    message: Extract<NpcRoleEditorWebviewToExtensionMessage, { type: "update-setting" }>,
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

  private async applyGraphWebviewEdit(
    document: HytaleNpcRoleDocument,
    message: NpcRoleEditorGraphEditMessage,
    webview: vscode.Webview,
  ): Promise<void> {
    if (
      typeof message.sourceVersion === "number" &&
      message.sourceVersion !== document.revision
    ) {
      LOGGER.error(
        `Version mismatch detected when applying NPC graph edit for "${message.fieldPath}". sourceVersion=${message.sourceVersion}, currentRevision=${document.revision}`,
      );
      await this.postError(webview, "The file changed in another editor. Please retry.");
      await this.postDocumentUpdate(document);
      return;
    }

    let edit: NodeEditorGraphEdit;
    let undoEdit: NodeEditorGraphEdit;
    try {
      edit = graphEditMessageToGraphEdit(message);
      undoEdit = invertNodeEditorGraphEdit(edit);
      this.applyGraphEditToDocument(document, message.fieldPath, edit);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      LOGGER.error(`Unable to apply NPC graph edit for "${message.fieldPath}": ${details}`);
      await this.postError(webview, details);
      await this.postDocumentUpdate(document);
      return;
    }

    const graphEdit: HytaleNpcRoleGraphEdit = {
      kind: "graphSectionEdit",
      fieldPath: message.fieldPath,
      label: `Edit ${message.fieldPath}`,
      edit,
      undoEdit,
      beforeRevision: document.revision - 1,
      afterRevision: document.revision,
      acknowledgedClientEditId: message.clientEditId,
    };

    this.onDidChangeCustomDocumentEmitter.fire({
      document,
      label: graphEdit.label,
      undo: async () => {
        this.applyGraphEditToDocument(document, graphEdit.fieldPath, graphEdit.undoEdit);
        await this.postGraphUpdate(document, {
          fieldPath: graphEdit.fieldPath,
          appliedEdit: graphEdit.undoEdit,
        });
        await this.postDocumentUpdate(document);
      },
      redo: async () => {
        this.applyGraphEditToDocument(document, graphEdit.fieldPath, graphEdit.edit);
        await this.postGraphUpdate(document, {
          fieldPath: graphEdit.fieldPath,
          appliedEdit: graphEdit.edit,
        });
        await this.postDocumentUpdate(document);
      },
    });
    await this.postGraphUpdate(document, {
      fieldPath: graphEdit.fieldPath,
      acknowledgedClientEditId: graphEdit.acknowledgedClientEditId,
      appliedEdit: graphEdit.edit,
    });
    await this.postDocumentUpdate(document);
  }

  private applyGraphEditToDocument(
    document: HytaleNpcRoleDocument,
    fieldPath: string,
    edit: NodeEditorGraphEdit,
  ): void {
    applyNpcGraphEditToDocument(document, {
      fieldPath,
      edit,
      resolveWorkspaceContext: workspaceRoot =>
        workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot(
          "NPC Behavior",
          workspaceRoot,
        ),
    });
  }
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

  const loadReferenceDocument = createVariantReferenceDocumentLoader(documentUri);
  const loadedReference = await loadReferenceDocument(trimmedReferenceName);
  if (loadedReference.status === "missing") {
    return {
      status: "missing",
      referenceName: trimmedReferenceName,
    };
  }

  if (loadedReference.status === "error") {
    return {
      status: "error",
      referenceName: trimmedReferenceName,
      message: loadedReference.message,
    };
  }

  const previewContext = await buildVariantAppearancePreviewContext({
    referenceName: trimmedReferenceName,
    currentDocumentReferenceName,
    loadReferenceDocument,
  });

  return {
    status: "loaded",
    referenceName: trimmedReferenceName,
    resolvedPath: loadedReference.reference.resolvedPath,
    text: loadedReference.reference.text,
    appearanceValue: previewContext?.appearanceValue,
    effectiveParameters: previewContext?.effectiveParameters,
  };
}

function createVariantReferenceDocumentLoader(
  documentUri: vscode.Uri,
): (referenceName: string) => Promise<VariantReferenceDocumentLoadResult> {
  const cache = new Map<string, Promise<VariantReferenceDocumentLoadResult>>();

  return async (referenceName: string) => {
    const trimmedReferenceName = referenceName.trim();
    if (!trimmedReferenceName) {
      return { status: "missing" };
    }

    let cached = cache.get(trimmedReferenceName);
    if (!cached) {
      cached = loadVariantReferenceDocument(trimmedReferenceName, documentUri);
      cache.set(trimmedReferenceName, cached);
    }

    return await cached;
  };
}

async function loadVariantReferenceDocument(
  trimmedReferenceName: string,
  documentUri: vscode.Uri,
): Promise<VariantReferenceDocumentLoadResult> {
  const openDocumentMatch = vscode.workspace.textDocuments.find(candidate => {
    return (
      candidate.uri.scheme === "file" &&
      candidate.uri.fsPath !== documentUri.fsPath &&
      matchesNpcRoleReferenceCandidate(candidate.uri.fsPath, trimmedReferenceName)
    );
  });

  if (openDocumentMatch) {
    const text = openDocumentMatch.getText();
    const parsedType = parseNpcRoleTypeFromText(text);
    if (isVariantReferenceRoleType(parsedType)) {
      return toLoadedVariantReferenceResult({
        referenceName: trimmedReferenceName,
        resolvedPath: openDocumentMatch.uri.fsPath,
        text,
      });
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

    if (!matchesNpcRoleReferenceCandidate(match.fsPath, trimmedReferenceName)) {
      continue;
    }

    try {
      const text = fs.readFileSync(match.fsPath, "utf8");
      const parsedType = parseNpcRoleTypeFromText(text);
      if (!isVariantReferenceRoleType(parsedType)) {
        continue;
      }

      return toLoadedVariantReferenceResult({
        referenceName: trimmedReferenceName,
        resolvedPath: match.fsPath,
        text,
      });
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
  if (registeredShard?.indexKind === "registeredAssets") {
    for (const [assetName, metadata] of Object.entries((registeredShard as RegisteredAssetsIndexShard).values)) {
      if (!matchesNpcRoleReferenceCandidate(assetName, trimmedReferenceName)) {
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

        return toLoadedVariantReferenceResult({
          referenceName: trimmedReferenceName,
          resolvedPath: metadata.sourcedFromFile,
          text,
        });
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    status: "missing",
  };
}

function toLoadedVariantReferenceResult(
  loadedReference: Omit<LoadedVariantReferenceDocument, "document">,
): VariantReferenceDocumentLoadResult {
  const parsedReference = parseLoadedVariantReferenceDocument(loadedReference);
  if (!parsedReference) {
    return {
      status: "error",
      message: `NPC role reference ${loadedReference.referenceName} could not be parsed.`,
    };
  }

  return {
    status: "loaded",
    reference: parsedReference,
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
