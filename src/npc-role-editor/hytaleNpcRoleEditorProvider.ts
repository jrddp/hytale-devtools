import * as vscode from "vscode";
import { assetCacheRuntime, indexes, LOGGER, workspaceRuntime } from "../extension";
import { getEffectiveRegisteredAssetsShard } from "../schema/symbolResolver";
import {
  createEmptyNodeEditorClipboardSelection,
  type NodeEditorClipboardSelection,
} from "../shared/node-editor/clipboardTypes";
import { graphEditMessageToGraphEdit } from "../shared/node-editor/graphEditMessages";
import { invertNodeEditorGraphEdit } from "../shared/node-editor/graphEditUtils";
import type { NodeEditorGraphEdit } from "../shared/node-editor/graphTypes";
import type {
  NodeEditorQuickActionPayload,
} from "../shared/node-editor/quickActions";
import type {
  NpcRoleEditorApplyMessage,
  NpcRoleEditorAssetIndexUpdateMessage,
  NpcRoleEditorContextActionMessage,
  NpcRoleEditorExtensionToWebviewMessage,
  NpcRoleEditorGraphEditMessage,
  NpcRoleEditorAppearancePreviewAnimationUpdateMessage,
  NpcRoleEditorAppearancePreviewBaseUpdateMessage,
  NpcRoleEditorWebviewToExtensionMessage,
} from "../shared/npc-role-editor/messageTypes";
import { buildViteWebviewHtml, resolveWebviewMediaRoot } from "../shared/webview/viteWebview";
import { registerNodeEditorQuickActionCommands } from "../node-editor/nodeEditorQuickActions";
import { HytaleNpcRoleDocument } from "./hytaleNpcRoleDocument";
import {
  resolveNpcAppearanceAnimationPreview,
  resolveNpcAppearanceBaseState,
} from "./appearancePreviewRuntime";
import { applyNpcGraphEditToDocument } from "./graphEditRuntime";
import { buildNpcRoleEditorBootstrapMessage } from "./npcRoleEditorBootstrap";
import {
  normalizeTextEol,
  readNpcRoleTextFromUri,
  writeNpcRoleTextToUri,
} from "./npcRoleEditorDocumentIO";
import {
  resolveComponentReferenceTargetState,
  resolveNpcAutocompleteValues,
  resolveVariantReferenceState,
} from "./npcRoleEditorReferenceLookup";

const VIEW_TYPE = "hytale-devtools.hytaleNpcRoleEditor";
const NPC_GRAPH_QUICK_ACTION_COMMAND_PREFIX = "hytale-devtools.npcRoleEditor.graph.quickAction.";
const NPC_GRAPH_ACTIVE_CONTEXT_KEY = "hytaleDevtools.npcRoleEditor.graphActive";
const DEFAULT_EDIT_LABEL = "Edit NPC Role";
const EXTENSION_CONFIG_NAMESPACE = "hytale-devtools";
const NODE_EDITOR_CONTROL_SCHEME_SETTING_KEY = "nodeEditor.controlScheme";

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
  const quickActionCommandRegistrations = registerNodeEditorQuickActionCommands(context, {
    commandPrefix: NPC_GRAPH_QUICK_ACTION_COMMAND_PREFIX,
    logger: LOGGER,
    postAction: payload => provider.triggerGraphQuickAction(payload),
  });

  return vscode.Disposable.from(
    registration,
    provider,
    ...quickActionCommandRegistrations,
    new vscode.Disposable(() => {
      if (activeProvider === provider) {
        activeProvider = null;
      }
      void vscode.commands.executeCommand("setContext", NPC_GRAPH_ACTIVE_CONTEXT_KEY, false);
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
  const nodeEditorGraphFieldPath =
    isRecord(context) && typeof context.nodeEditorGraphFieldPath === "string"
      ? context.nodeEditorGraphFieldPath
      : null;
  const nodeEditorNodeId =
    isRecord(context) && typeof context.nodeEditorNodeId === "string" ? context.nodeEditorNodeId : null;
  const nodeEditorFieldSchemaKey =
    isRecord(context) && typeof context.nodeEditorFieldSchemaKey === "string"
      ? context.nodeEditorFieldSchemaKey
      : null;
  const nodeEditorListItemIndex =
    isRecord(context) &&
    typeof context.nodeEditorListItemIndex === "number" &&
    Number.isInteger(context.nodeEditorListItemIndex) &&
    context.nodeEditorListItemIndex >= 0
      ? context.nodeEditorListItemIndex
      : null;

  if (!activeProvider) {
    return;
  }

  if (action === "setGraphRoot" || action === "setGraphFieldExplicitEmpty") {
    if (!nodeEditorGraphFieldPath || !nodeEditorNodeId) {
      return;
    }

    if (action === "setGraphFieldExplicitEmpty" && !nodeEditorFieldSchemaKey) {
      return;
    }

    await activeProvider.postContextAction({
      type: "contextAction",
      action,
      fieldPath: nodeEditorGraphFieldPath,
      nodeEditorNodeId,
      nodeEditorFieldSchemaKey: nodeEditorFieldSchemaKey ?? undefined,
      nodeEditorListItemIndex: nodeEditorListItemIndex ?? undefined,
    });
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

export async function notifyNpcRoleEditorsAssetIndexUpdated(revision: number): Promise<void> {
  await activeProvider?.postAssetIndexUpdate({
    type: "assetIndexUpdate",
    revision,
  });
}

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
  private readonly graphPageActiveByPanel = new Map<vscode.WebviewPanel, boolean>();
  private activeDocumentUri: string | undefined;
  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private copiedSelection: NodeEditorClipboardSelection = createEmptyNodeEditorClipboardSelection();

  constructor(private readonly context: vscode.ExtensionContext) {
    void vscode.commands.executeCommand("setContext", NPC_GRAPH_ACTIVE_CONTEXT_KEY, false);
  }

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
      this.getPanelsForDocument(documentUri).add(webviewPanel);

      if (webviewPanel.active) {
        this.activeDocumentUri = documentUri;
        this.activeWebviewPanel = webviewPanel;
        this.updateGraphActiveContext();
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
          const payload = buildNpcRoleEditorBootstrapMessage(this.context, this.copiedSelection);
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
          this.activeWebviewPanel = webviewPanel;
          this.updateGraphActiveContext();
        } else if (this.activeDocumentUri === documentUri) {
          this.activeDocumentUri = undefined;
          if (this.activeWebviewPanel === webviewPanel) {
            this.activeWebviewPanel = undefined;
            this.updateGraphActiveContext();
          }
        }
      });

      webviewPanel.onDidDispose(() => {
        isDisposed = true;
        panelViewStateSubscription.dispose();
        this.graphPageActiveByPanel.delete(webviewPanel);
        this.removePanelForDocument(documentUri, webviewPanel);
        if (this.activeDocumentUri === documentUri) {
          this.activeDocumentUri = undefined;
        }
        if (this.activeWebviewPanel === webviewPanel) {
          this.activeWebviewPanel = undefined;
          this.updateGraphActiveContext();
        }
      });

      let basePreviewResolutionVersion = 0;
      let animationPreviewResolutionVersion = 0;

      const postResolvedBasePreview = async (
        assetName: string | undefined,
        appearanceStatePromise: Promise<Awaited<ReturnType<typeof resolveNpcAppearanceBaseState>>>,
      ) => {
        const resolutionVersion = ++basePreviewResolutionVersion;
        const appearanceState = await appearanceStatePromise;
        if (isDisposed || resolutionVersion !== basePreviewResolutionVersion) {
          return;
        }

        await webviewPanel.webview.postMessage({
          type: "appearancePreviewBaseUpdate",
          assetName,
          basePreview: appearanceState.basePreview,
          animationIds: appearanceState.animationIds,
          idleAnimationPreview: appearanceState.idleAnimationPreview,
        } satisfies NpcRoleEditorAppearancePreviewBaseUpdateMessage);
      };

      const postResolvedAnimationPreview = async (
        assetName: string | undefined,
        animationSetId: string,
        animationPreviewPromise: Promise<Awaited<ReturnType<typeof resolveNpcAppearanceAnimationPreview>>>,
      ) => {
        const resolutionVersion = ++animationPreviewResolutionVersion;
        const animationPreview = await animationPreviewPromise;
        if (isDisposed || resolutionVersion !== animationPreviewResolutionVersion || !assetName) {
          return;
        }

        await webviewPanel.webview.postMessage({
          type: "appearancePreviewAnimationUpdate",
          assetName,
          animationSetId,
          animationPreview,
        } satisfies NpcRoleEditorAppearancePreviewAnimationUpdateMessage);
      };

      const sendResolvedAppearancePreviewBase = async (
        assetName: string | undefined,
      ) => {
        if (isDisposed) {
          return;
        }

        if (!assetCacheRuntime.isReady) {
          if (!assetName) {
            return;
          }

          void assetCacheRuntime.ready.then(() => {
            if (!isDisposed && assetCacheRuntime.isReady) {
              void sendResolvedAppearancePreviewBase(assetName);
            }
          });
          return;
        }

        const modelAssetIndex = indexes.get("registeredAssets")?.get("ModelAsset");
        const effectiveModelAssetIndex =
          modelAssetIndex?.indexKind === "registeredAssets"
            ? getEffectiveRegisteredAssetsShard("ModelAsset", modelAssetIndex)
            : getEffectiveRegisteredAssetsShard("ModelAsset");
        await postResolvedBasePreview(
          assetName,
          resolveNpcAppearanceBaseState(
            assetName,
            assetCacheRuntime,
            effectiveModelAssetIndex,
          ),
        );
      };

      const sendResolvedAppearancePreviewAnimation = async (
        assetName: string,
        animationSetId: string,
      ) => {
        if (isDisposed) {
          return;
        }

        if (!assetCacheRuntime.isReady) {
          void assetCacheRuntime.ready.then(() => {
            if (!isDisposed && assetCacheRuntime.isReady) {
              void sendResolvedAppearancePreviewAnimation(assetName, animationSetId);
            }
          });
          return;
        }

        const modelAssetIndex = indexes.get("registeredAssets")?.get("ModelAsset");
        const effectiveModelAssetIndex =
          modelAssetIndex?.indexKind === "registeredAssets"
            ? getEffectiveRegisteredAssetsShard("ModelAsset", modelAssetIndex)
            : getEffectiveRegisteredAssetsShard("ModelAsset");
        await postResolvedAnimationPreview(
          assetName,
          animationSetId,
          resolveNpcAppearanceAnimationPreview(
            assetName,
            animationSetId,
            assetCacheRuntime,
            effectiveModelAssetIndex,
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
          case "graphPageActive":
            this.graphPageActiveByPanel.set(webviewPanel, message.active);
            if (this.activeWebviewPanel === webviewPanel) {
              this.updateGraphActiveContext();
            }
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
          case "resolveComponentReferenceTarget":
            void this.resolveComponentReferenceTarget(
              message.componentClass,
              message.referenceName,
              document.uri,
              webviewPanel.webview,
            );
            return;
          case "resolveAppearancePreviewBase":
            void sendResolvedAppearancePreviewBase(message.assetName);
            return;
          case "resolveAppearancePreviewAnimation":
            void sendResolvedAppearancePreviewAnimation(message.assetName, message.animationSetId);
            return;
          case "apply":
            void this.applyWebviewEdits(document, message, webviewPanel.webview);
            return;
          case "edit":
            LOGGER.info(message.kind + ", " + message.fieldPath);
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
    if (this.activeWebviewPanel) {
      return this.activeWebviewPanel;
    }

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

  private updateGraphActiveContext(): void {
    void vscode.commands.executeCommand(
      "setContext",
      NPC_GRAPH_ACTIVE_CONTEXT_KEY,
      this.activeWebviewPanel
        ? this.graphPageActiveByPanel.get(this.activeWebviewPanel) === true
        : false,
    );
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

  public async triggerGraphQuickAction(payload: NodeEditorQuickActionPayload): Promise<void> {
    const targetPanel = this.resolveTargetWebviewPanel();
    if (!targetPanel || this.graphPageActiveByPanel.get(targetPanel) !== true) {
      return;
    }

    await targetPanel.webview.postMessage({
      type: "graphAction",
      request: payload.request,
      allowEditableTarget: payload.allowEditableTarget,
    } satisfies NpcRoleEditorExtensionToWebviewMessage);
  }

  public async postAssetIndexUpdate(message: NpcRoleEditorAssetIndexUpdateMessage): Promise<void> {
    const allPanels = Array.from(this.webviewPanelsByDocumentUri.values()).flatMap(panels =>
      Array.from(panels),
    );
    await Promise.all(allPanels.map(panel => panel.webview.postMessage(message)));
  }

  private async autocompleteRequest(
    message: Extract<NpcRoleEditorWebviewToExtensionMessage, { type: "autocompleteRequest" }>,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<void> {
    await webview.postMessage({
      type: "autocompletionValues",
      fieldId: message.fieldId,
      values: await resolveNpcAutocompleteValues(message.symbolLookup, documentUri),
    } satisfies NpcRoleEditorExtensionToWebviewMessage);
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

  private async resolveComponentReferenceTarget(
    componentClass: string,
    referenceName: string,
    documentUri: vscode.Uri,
    webview: vscode.Webview,
  ): Promise<void> {
    const trimmedReferenceName = referenceName.trim();
    if (!trimmedReferenceName) {
      return;
    }

    const target = await resolveComponentReferenceTargetState(
      componentClass,
      trimmedReferenceName,
      documentUri,
    );
    await webview.postMessage({
      type: "componentReferenceTargetUpdate",
      target,
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
