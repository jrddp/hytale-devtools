// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ensureCompanionModGenerated } from './companion/generateCompanionMod';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "hytale-devtools" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposableHelloWorld = vscode.commands.registerCommand('hytale-devtools.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Hytale Devtools!');
	});

	const createModCommand = vscode.commands.registerCommand('hytale-devtools.createMod', () => {
		const { createMod } = require('./commands/createMod');
		createMod(context);
	});

	context.subscriptions.push(disposableHelloWorld);
	context.subscriptions.push(createModCommand);

	const addListenerCommand = vscode.commands.registerCommand('hytale-devtools.addListener', () => {
		const { addListener } = require('./commands/addListener');
		addListener(context);
	});
	context.subscriptions.push(addListenerCommand);

	void ensureCompanionModGenerated(context).catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Failed to generate and build companion mod in extension storage:', message);
		vscode.window.showWarningMessage(`Hytale Devtools could not build companion mod: ${message}`);
	});
}

// This method is called when your extension is deactivated
export function deactivate() { }
