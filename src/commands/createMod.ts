import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { toCamelCase, toPascalCase, toSquashedCase, replaceTokens } from '../utils/stringUtils';
import { getCompanionPaths } from '../utils/companionPaths';
import { ensureCompanionModGenerated } from '../companion/generateCompanionMod';

const TEMPLATE_DIR_NAME = 'templates/basic-mod';


export async function createMod(context: vscode.ExtensionContext) {
    // 1. Prompt for Mod Name
    const modName = await vscode.window.showInputBox({
        placeHolder: 'Enter the name of your Hytale mod',
        prompt: 'Mod Name'
    });

    if (!modName) {
        return;
    }

    // 2. Select Destination Folder
    const folderResult = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Parent Folder'
    });

    if (!folderResult || folderResult.length === 0) {
        return;
    }

    const destinationRoot = folderResult[0].fsPath;
    const modNamePascal = toPascalCase(modName);
    const modNameSquashed = toSquashedCase(modName);
    const destinationPath = path.join(destinationRoot, modNamePascal);

    if (fs.existsSync(destinationPath)) {
        vscode.window.showErrorMessage(`Directory ${modNamePascal} already exists in the selected location.`);
        return;
    }

    // 3. Get Configuration & Prompt for Missing Values
    const config = vscode.workspace.getConfiguration('hytale-devtools');

    let author = config.get<string>('defaultAuthor') || '';
    let group = config.get<string>('defaultGroup') || '';
    let website = config.get<string>('defaultWebsite') || '';

    const companionPaths = getCompanionPaths(context);
    if (!fs.existsSync(companionPaths.companionModArtifactPath)) {
        try {
            await ensureCompanionModGenerated(context);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showWarningMessage(`Companion mod artifacts are unavailable and build failed: ${message}`);
        }
    }

    let updateConfig = false;

    if (!author) {
        author = await vscode.window.showInputBox({
            prompt: 'Author Name',
            placeHolder: 'e.g., John Doe'
        }) || 'Unknown';
        updateConfig = true;
    }

    if (!group) {
        group = await vscode.window.showInputBox({
            prompt: 'Group Name (for package)',
            placeHolder: 'e.g., org.example'
        }) || 'org.example';
        updateConfig = true;
    }

    if (!website) {
        website = await vscode.window.showInputBox({
            prompt: 'Website',
            placeHolder: 'e.g., example.com'
        }) || 'example.com';
        updateConfig = true;
    }

    if (updateConfig) {
        const remember = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Remember these settings for future mods?'
        });

        if (remember === 'Yes') {
            await config.update('defaultAuthor', author, vscode.ConfigurationTarget.Global);
            await config.update('defaultGroup', group, vscode.ConfigurationTarget.Global);
            await config.update('defaultWebsite', website, vscode.ConfigurationTarget.Global);
        }
    }

    // 4. Copy Template and Replace Tokens
    const templatePath = context.asAbsolutePath(TEMPLATE_DIR_NAME);
    const replacements = {
        '{{MOD_NAME}}': modName,
        '{{MOD_NAME_CAMEL}}': toCamelCase(modName),
        '{{MOD_NAME_PASCAL}}': modNamePascal,
        '{{MOD_NAME_SQUASHED}}': modNameSquashed,
        '{{AUTHOR}}': author,
        '{{GROUP}}': group,
        '{{WEBSITE}}': website,
        '{{COMPANION_BUILT_MODS_PATH}}': normalizePathForTemplate(companionPaths.companionModArtifactPath)
    };

    try {
        await copyRecursive(templatePath, destinationPath, replacements);

        // 5. Restructure Java Package
        await restructureJavaPackage(destinationPath, group, modNameSquashed, modNamePascal);

        // 6. Git Init
        await initGit(destinationPath);

        vscode.window.showInformationMessage(`Hytale Mod "${modName}" created successfully!`);

        // Open the created folder
        // const isWorkspaceOpen = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        // const openInNewWindow = isWorkspaceOpen;
        const openInNewWindow = false;

        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(destinationPath), openInNewWindow);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create mod: ${error}`);
    }
}

async function initGit(root: string) {
    try {
        const exec = require('child_process').exec;
        const util = require('util');
        const execAsync = util.promisify(exec);

        await execAsync('git init', { cwd: root });
        await execAsync('git add .', { cwd: root });
        await execAsync('git -c user.name="Kokeria" -c user.email="code@jareds.computer" commit -m "Hytale mod initialized using Hytale Devtools VSCode Extension"', { cwd: root });
    } catch (error) {
        console.error('Failed to initialize git repository:', error);
        vscode.window.showWarningMessage('Mod created, but failed to initialize git repository.');
    }
}

function getSymlinkType(src: string, linkTarget: string): 'file' | 'junction' | undefined {
    if (process.platform !== 'win32') {
        return undefined;
    }

    const resolvedTarget = path.resolve(path.dirname(src), linkTarget);

    try {
        if (fs.statSync(resolvedTarget).isDirectory()) {
            return 'junction';
        }
    } catch {
        // Keep default type when target cannot be resolved.
    }

    return 'file';
}

async function copyRecursive(src: string, dest: string, replacements: Record<string, string>) {
    if (!fs.existsSync(src)) {
        return;
    }

    const stats = fs.lstatSync(src);

    if (stats.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(src);
        const symlinkType = getSymlinkType(src, linkTarget);

        const parentDir = path.dirname(dest);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.symlinkSync(linkTarget, dest, symlinkType);
        return;
    }

    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const files = fs.readdirSync(src);
        for (const file of files) {
            await copyRecursive(path.join(src, file), path.join(dest, file), replacements);
        }
        return;
    }

    const hasTemplateExtension = src.endsWith('.template');
    let destPath = dest;

    // Strip .template extension from destination path if present in source
    if (hasTemplateExtension) {
        destPath = dest.substring(0, dest.length - '.template'.length);
    }

    if (hasTemplateExtension) {
        const content = fs.readFileSync(src, 'utf8');
        const newContent = replaceTokens(content, replacements);
        fs.writeFileSync(destPath, newContent, 'utf8');
    } else {
        fs.copyFileSync(src, destPath);
    }
}

async function restructureJavaPackage(root: string, group: string, modSquashed: string, mainClass: string) {
    const oldPath = path.join(root, 'src', 'main', 'java', 'org', 'example', 'plugin');

    // Construct new path: src/main/java + group (split by .) + mod (raw squashed)
    const groupParts = group.split('.');
    // const modParts = modDot.split('.'); // Old logic
    const newPath = path.join(root, 'src', 'main', 'java', ...groupParts, modSquashed);

    if (fs.existsSync(oldPath)) {
        // Create new directory structure
        fs.mkdirSync(newPath, { recursive: true });

        // Move files
        const files = fs.readdirSync(oldPath);
        for (const file of files) {
            let targetName = file;
            if (file === 'ExamplePlugin.java') {
                targetName = `${mainClass}.java`;
            }
            fs.renameSync(path.join(oldPath, file), path.join(newPath, targetName));
        }

        // Rename config file if it exists
        const configPath = path.join(newPath, 'config', 'ExampleConfig.java');
        if (fs.existsSync(configPath)) {
            fs.renameSync(configPath, path.join(newPath, 'config', `${mainClass}Config.java`));
        }

        // Cleanup empty old directories
        // We can just delete the entire org/example/plugin structure since we moved everything
        // But we should act carefully. The template starts with org/example/plugin.
        // If the user's group is 'org.example.plugin', we might have just moved files to the same place or subfolder.
        // Assuming the new path is different enough or we handle it.
        // If we move to org/example/plugin/something, the old path is still valid until we delete.
        // Simplest strategy: Delete known template path `org/example/plugin`.
        // Then walk up and delete empty parents.

        try {
            // Only delete if empty? The files loop moved everything.
            // fs.renameSync handles moves fine.
            fs.rmdirSync(oldPath); // Removed the leaf 'plugin'

            // Try removing 'example'
            const examplePath = path.join(root, 'src', 'main', 'java', 'org', 'example');
            if (fs.existsSync(examplePath) && fs.readdirSync(examplePath).length === 0) {
                fs.rmdirSync(examplePath);
            }

            // Try removing 'org'
            const orgPath = path.join(root, 'src', 'main', 'java', 'org');
            if (fs.existsSync(orgPath) && fs.readdirSync(orgPath).length === 0) {
                fs.rmdirSync(orgPath);
            }
        } catch (e) {
            // Ignore clean up errors
        }
    }
}

function normalizePathForTemplate(value: string): string {
    return value.replace(/\\/g, '/');
}
