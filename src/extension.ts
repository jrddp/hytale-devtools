// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerHytaleNodeEditorProvider } from './editors/hytaleNodeEditorProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "hytale-devtools" is now active!');

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

	context.subscriptions.push(registerHytaleNodeEditorProvider(context));
}

// This method is called when your extension is deactivated
export function deactivate() { }
