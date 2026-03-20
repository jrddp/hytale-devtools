import path from "path";
import * as vscode from "vscode";
import { AssetCacheRuntime } from "./asset-cache/assetCacheRuntime";
import { registerHytaleAssetEditorProvider } from "./asset-editor/hytaleAssetEditorProvider";
import { registerHytaleNodeEditorProvider } from "./node-editor/hytaleNodeEditorProvider";
import { WorkspaceRuntime } from "./node-editor/workspaceResolver";
import { SchemaRuntime } from "./schema/schemaLoader";
import { createSchemaWatcherRuntime } from "./schema/schemaWatcher";
import { loadIndexesFromRoot } from "./schema/symbolResolver";
import { type IndexKind, type SymbolIndex } from "./shared/indexTypes";
import { ensureHytaleHomeConfiguredOnStartup } from "./utils/hytaleHomeConfiguration";
import {
  getAssetsZipPath,
  resolveDataRootDirFromContext,
  resolvePatchlineForContext,
  SCHEMAS_DIRECTORY_NAME,
} from "./utils/hytalePaths";

export let LOGGER: vscode.LogOutputChannel;
export let schemaRuntime: SchemaRuntime;
export let workspaceRuntime: WorkspaceRuntime;
export let assetCacheRuntime: AssetCacheRuntime;
export let indexes: Map<IndexKind, SymbolIndex>;

function reloadSchemaData(context: vscode.ExtensionContext, reason: string): void {
  assetCacheRuntime?.dispose();
  const dataRoot = resolveDataRootDirFromContext(context);

  schemaRuntime = new SchemaRuntime(
    path.join(dataRoot.rootPath, SCHEMAS_DIRECTORY_NAME),
    LOGGER,
  );
  workspaceRuntime = new WorkspaceRuntime(
    context.asAbsolutePath(path.join("default-data", "node-editor-workspace-definitions")),
    schemaRuntime,
    LOGGER,
  );

  indexes = loadIndexesFromRoot(dataRoot.rootPath);
  assetCacheRuntime = new AssetCacheRuntime(
    getAssetsZipPath(resolvePatchlineForContext(context)),
    schemaRuntime,
    LOGGER,
  );

  void assetCacheRuntime.ready.catch(error => {
    LOGGER.error(
      `Failed to load base-game asset cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  });

  LOGGER.info(`Loaded schema data from ${dataRoot.source} (${dataRoot.rootPath}) - (${reason})`);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  LOGGER = vscode.window.createOutputChannel("Hytale Devtools", { log: true });
  context.subscriptions.push(LOGGER);
  LOGGER.info(`Activating Hytale Devtools extension`);

  const schemaWatcherRuntime = createSchemaWatcherRuntime(context, reason => {
    reloadSchemaData(context, reason);
  });
  context.subscriptions.push(schemaWatcherRuntime);

  reloadSchemaData(context, "extension activation");

  const createModCommand = vscode.commands.registerCommand("hytale-devtools.createMod", () => {
    const { createMod } = require("./commands/createMod");
    createMod(context);
  });
  context.subscriptions.push(createModCommand);

  const addListenerCommand = vscode.commands.registerCommand("hytale-devtools.addListener", () => {
    const { addListener } = require("./commands/addListener");
    addListener(context);
  });
  context.subscriptions.push(addListenerCommand);

  const copyBaseGameAssetCommand = vscode.commands.registerCommand(
    "hytale-devtools.copyBaseGameAsset",
    () => {
      const { copyBaseGameAsset } = require("./commands/copyBaseGameAsset");
      copyBaseGameAsset(context);
    },
  );
  context.subscriptions.push(copyBaseGameAssetCommand);

  const changeModPatchlineCommand = vscode.commands.registerCommand(
    "hytale-devtools.changeModPatchline",
    () => {
      const { changeModPatchline } = require("./commands/changeModPatchline");
      changeModPatchline(context);
    },
  );
  context.subscriptions.push(changeModPatchlineCommand);

  context.subscriptions.push(registerHytaleNodeEditorProvider(context));
  context.subscriptions.push(registerHytaleAssetEditorProvider(context));

  if ((vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
    void ensureHytaleHomeConfiguredOnStartup();
  }

  // const ensureCompanionSupportForWorkspace = (workspacePath: string): void => {
  //   const {
  //     ensureCompanionModSupportForWorkspace,
  //   } = require("./commands/ensureCompanionModSupport");
  //   void ensureCompanionModSupportForWorkspace(context, workspacePath);
  //   if (detectHytaleModWorkspace(workspacePath)) {
  //     companionSnapshotRuntime.registerWorkspace(workspacePath);
  //   }
  // };

  // for (const folder of vscode.workspace.workspaceFolders ?? []) {
  //   ensureCompanionSupportForWorkspace(folder.uri.fsPath);
  // }

  // context.subscriptions.push(
  //   vscode.workspace.onDidChangeWorkspaceFolders(event => {
  //     for (const folder of event.added) {
  //       ensureCompanionSupportForWorkspace(folder.uri.fsPath);
  //     }

  //     for (const folder of event.removed) {
  //       companionSnapshotRuntime.unregisterWorkspace(folder.uri.fsPath);
  //     }
  //   }),
  // );
}

// This method is called when your extension is deactivated
export function deactivate() {
  assetCacheRuntime?.dispose();
}
