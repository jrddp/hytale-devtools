// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerHytaleNodeEditorProvider } from './editors/hytaleNodeEditorProvider';
import { detectHytaleModWorkspace } from './commands/changeModPatchline';
import { createCompanionSnapshotRuntime } from './shared/companion/snapshotStore';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const companionSnapshotRuntime = createCompanionSnapshotRuntime(context);
	context.subscriptions.push(companionSnapshotRuntime);

	const createModCommand = vscode.commands.registerCommand('hytale-devtools.createMod', () => {
		const { createMod } = require('./commands/createMod');
		createMod(context);
	});

	context.subscriptions.push(createModCommand);

	const addListenerCommand = vscode.commands.registerCommand('hytale-devtools.addListener', () => {
		const { addListener } = require('./commands/addListener');
		addListener(context);
	});
	context.subscriptions.push(addListenerCommand);

	const copyBaseGameAssetCommand = vscode.commands.registerCommand('hytale-devtools.copyBaseGameAsset', () => {
		const { copyBaseGameAsset } = require('./commands/copyBaseGameAsset');
		copyBaseGameAsset(context);
	});
	context.subscriptions.push(copyBaseGameAssetCommand);

	const changeModPatchlineCommand = vscode.commands.registerCommand('hytale-devtools.changeModPatchline', () => {
		const { changeModPatchline } = require('./commands/changeModPatchline');
		changeModPatchline(context);
	});
	context.subscriptions.push(changeModPatchlineCommand);

	context.subscriptions.push(registerHytaleNodeEditorProvider(context, companionSnapshotRuntime));

	const ensureCompanionSupportForWorkspace = (workspacePath: string): void => {
		const { ensureCompanionModSupportForWorkspace } = require('./commands/ensureCompanionModSupport');
		void ensureCompanionModSupportForWorkspace(context, workspacePath);
		if (detectHytaleModWorkspace(workspacePath)) {
			companionSnapshotRuntime.registerWorkspace(workspacePath);
		}
	};

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		ensureCompanionSupportForWorkspace(folder.uri.fsPath);
	}

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event => {
		for (const folder of event.added) {
			ensureCompanionSupportForWorkspace(folder.uri.fsPath);
		}

		for (const folder of event.removed) {
			companionSnapshotRuntime.unregisterWorkspace(folder.uri.fsPath);
		}
	}));
}

// This method is called when your extension is deactivated
export function deactivate() { }
