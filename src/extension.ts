import path from "path";
import * as vscode from "vscode";
import { registerHytaleNodeEditorProvider } from "./node-editor/hytaleNodeEditorProvider";
import { getNodeEditorWorkspaces } from "./node-editor/workspaceResolver";
import { createSchemaDataRuntime } from "./schema/schemaDataRuntime";
import { loadSchemaDefinitionsFromRoot, loadSchemaMappingsFromRoot } from "./schema/schemaLoader";
import { type SchemaDocs } from "./schema/schemaPointerResolver";
import { loadIndexesFromRoot } from "./schema/symbolResolver";
import { type NodeEditorWorkspace } from "./shared/node-editor/workspaceTypes";
import { type IndexKind, type SchemaMappings, type SymbolIndex } from "./shared/schema/types";
import { resolvePatchlineForContext, resolveSchemaDataLocation } from "./utils/hytalePaths";

export let LOGGER: vscode.LogOutputChannel;
export let nodeEditorWorkspaces: Record<string, NodeEditorWorkspace>;
export let schemaMappings: SchemaMappings;
export let schemaDocs: SchemaDocs;
export let indexes: Map<IndexKind, SymbolIndex>;

function reloadSchemaData(context: vscode.ExtensionContext, reason: string): void {
  const patchline = resolvePatchlineForContext(context);
  const schemaDataLocation = resolveSchemaDataLocation(context, patchline);

  schemaMappings = loadSchemaMappingsFromRoot(schemaDataLocation.rootPath);
  schemaDocs = loadSchemaDefinitionsFromRoot(schemaDataLocation.rootPath);
  indexes = loadIndexesFromRoot(schemaDataLocation.rootPath);

  LOGGER.info(
    `Loaded schema data from ${schemaDataLocation.source} (${schemaDataLocation.rootPath}) for ${patchline} patchline (${reason})`,
  );
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  LOGGER = vscode.window.createOutputChannel("Hytale Devtools", { log: true });
  context.subscriptions.push(LOGGER);

  const schemaDataRuntime = createSchemaDataRuntime(context, reason => {
    reloadSchemaData(context, reason);
  });
  context.subscriptions.push(schemaDataRuntime);

  reloadSchemaData(context, "extension activation");

  nodeEditorWorkspaces = getNodeEditorWorkspaces(
    context.asAbsolutePath(path.join("default-data", "node-editor-workspace-definitions")),
  );

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
export function deactivate() {}
