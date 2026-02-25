// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { registerHytaleNodeEditorProvider } from "./node-editor/hytaleNodeEditorProvider";
import { detectHytaleModWorkspace } from "./commands/changeModPatchline";
import { createCompanionSnapshotRuntime } from "./shared/companion/snapshotStore";
import { getNodeEditorWorkspaces } from "./node-editor/workspaceTemplates";
import { type NodeEditorWorkspace } from "./shared/node-editor/workspaceTypes";

export let LOGGER: vscode.LogOutputChannel;
export let nodeEditorWorkspaces: Record<string, NodeEditorWorkspace>;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  LOGGER = vscode.window.createOutputChannel("Hytale Devtools", { log: true });
  context.subscriptions.push(LOGGER);

  const companionSnapshotRuntime = createCompanionSnapshotRuntime(context);
  context.subscriptions.push(companionSnapshotRuntime);

  nodeEditorWorkspaces = getNodeEditorWorkspaces(
    context.asAbsolutePath("webview/hytale-node-editor/Workspaces"),
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

  const ensureCompanionSupportForWorkspace = (workspacePath: string): void => {
    const {
      ensureCompanionModSupportForWorkspace,
    } = require("./commands/ensureCompanionModSupport");
    void ensureCompanionModSupportForWorkspace(context, workspacePath);
    if (detectHytaleModWorkspace(workspacePath)) {
      companionSnapshotRuntime.registerWorkspace(workspacePath);
    }
  };

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    ensureCompanionSupportForWorkspace(folder.uri.fsPath);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      for (const folder of event.added) {
        ensureCompanionSupportForWorkspace(folder.uri.fsPath);
      }

      for (const folder of event.removed) {
        companionSnapshotRuntime.unregisterWorkspace(folder.uri.fsPath);
      }
    }),
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
