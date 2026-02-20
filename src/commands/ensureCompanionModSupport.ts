import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolvePatchlineFromWorkspace } from '../utils/hytalePaths';
import { parseJsonc } from '../utils/jsonc';
import { detectHytaleModWorkspace, rewriteLaunchArgs } from './changeModPatchline';

const LAUNCH_CONFIG_RELATIVE_PATH = path.join('.vscode', 'launch.json');
const COMPANION_CONFIG_RELATIVE_PATH = path.join('run', 'mods', 'kokeria_HytaleDevtoolsCompanion', 'config.json');
const LEGACY_COMPANION_CONFIG_RELATIVE_PATH = path.join('run', 'plugins', 'HytaleDevtoolsCompanion', 'config.json');
const COMPANION_MOD_LIBS_RELATIVE_PATH = path.join('companion-mod', 'build', 'libs');
const HYTALE_SERVER_MAIN_CLASS = 'com.hypixel.hytale.Main';

const ENABLE_COMPANION_LABEL = 'Enable Companion Mod';
const NOT_NOW_LABEL = 'Not Now';
const ENABLE_COMPANION_PROMPT =
    'Set up Hytale Devtools autocompletion for this project by enabling the companion mod in launch.json?';

type SupportedPatchline = 'release' | 'pre-release';

interface LaunchConfigurationDocument {
    configurations?: unknown;
    [key: string]: unknown;
}

interface LaunchConfigurationEntry {
    mainClass?: unknown;
    args?: unknown;
    [key: string]: unknown;
}

interface CompanionConfigLocation {
    readPath?: string;
    writePath: string;
    removeLegacyAfterWrite: boolean;
}

export async function ensureCompanionModSupportForWorkspace(
    context: vscode.ExtensionContext,
    workspaceRootPath: string
): Promise<void> {
    try {
        if (!detectHytaleModWorkspace(workspaceRootPath)) {
            return;
        }

        const companionModsPath = normalizePathForJson(context.asAbsolutePath(COMPANION_MOD_LIBS_RELATIVE_PATH));
        const patchline = toSupportedPatchline(resolvePatchlineFromWorkspace(workspaceRootPath));
        upsertCompanionConfig(workspaceRootPath, context, patchline);
        await updateLaunchJsonForCompanionSupport(workspaceRootPath, context, patchline);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Hytale Devtools companion workspace setup failed: ${message}`);
    }
}

async function updateLaunchJsonForCompanionSupport(
    workspaceRootPath: string,
    context: vscode.ExtensionContext,
    patchline: SupportedPatchline
): Promise<void> {
    const launchConfigPath = path.join(workspaceRootPath, LAUNCH_CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(launchConfigPath)) {
        return;
    }

    const rawContent = fs.readFileSync(launchConfigPath, 'utf8');
    let parsedDocument: LaunchConfigurationDocument;
    try {
        parsedDocument = parseJsonc(rawContent) as LaunchConfigurationDocument;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Launch config at "${launchConfigPath}" is not valid JSON: ${message}`);
    }

    if (!Array.isArray(parsedDocument.configurations)) {
        return;
    }

    const companionModsPath = normalizePathForJson(context.asAbsolutePath(COMPANION_MOD_LIBS_RELATIVE_PATH));
    const needsCompanionModsAppend = launchConfigurationsNeedCompanionModsAppend(
        parsedDocument.configurations as unknown[],
        companionModsPath
    );
    const allowCompanionModsAppend = !needsCompanionModsAppend || await promptEnableCompanionMod();

    let hasChanges = false;
    for (const configuration of parsedDocument.configurations) {
        if (!isHytaleServerLaunchConfiguration(configuration)) {
            continue;
        }

        const args = Array.isArray(configuration.args)
            ? configuration.args.filter((arg): arg is string => typeof arg === 'string')
            : [];
        const rewritten = rewriteLaunchArgs(
            args,
            patchline,
            companionModsPath,
            false,
            allowCompanionModsAppend
        );

        if (rewritten.changed) {
            configuration.args = rewritten.args;
            hasChanges = true;
        }
    }

    if (hasChanges) {
        fs.writeFileSync(launchConfigPath, `${JSON.stringify(parsedDocument, null, 4)}\n`, 'utf8');
    }
}

function launchConfigurationsNeedCompanionModsAppend(
    configurations: readonly unknown[],
    companionModsPath: string
): boolean {
    const desiredCompanionModsArgLower = `--mods=${normalizePathForJson(companionModsPath)}`.toLowerCase();

    return configurations.some(configuration => {
        if (!isHytaleServerLaunchConfiguration(configuration)) {
            return false;
        }

        const args = Array.isArray(configuration.args)
            ? configuration.args.filter((arg): arg is string => typeof arg === 'string')
            : [];
        const hasDesiredCompanionModsArg = args.some(arg => normalizePathForJson(arg).toLowerCase() === desiredCompanionModsArgLower);
        const hasLegacyCompanionModsArg = args.some(arg => isLegacyCompanionModsArg(arg));

        return !hasDesiredCompanionModsArg && !hasLegacyCompanionModsArg;
    });
}

function isLegacyCompanionModsArg(arg: string): boolean {
    if (!arg.startsWith('--mods=')) {
        return false;
    }

    const modsValue = normalizePathForJson(arg.slice('--mods='.length));
    return modsValue.includes('companion/HytaleDevtoolsCompanion');
}

function isHytaleServerLaunchConfiguration(value: unknown): value is LaunchConfigurationEntry {
    if (!isObject(value)) {
        return false;
    }
    return value.mainClass === HYTALE_SERVER_MAIN_CLASS;
}

async function promptEnableCompanionMod(): Promise<boolean> {
    const selection = await vscode.window.showInformationMessage(
        ENABLE_COMPANION_PROMPT,
        ENABLE_COMPANION_LABEL,
        NOT_NOW_LABEL
    );
    return selection === ENABLE_COMPANION_LABEL;
}

function upsertCompanionConfig(
    workspaceRootPath: string,
    context: vscode.ExtensionContext,
    patchline: SupportedPatchline
): void {
    const companionConfigLocation = resolveCompanionConfigLocation(workspaceRootPath);
    const companionConfigDirectory = path.dirname(companionConfigLocation.writePath);
    fs.mkdirSync(companionConfigDirectory, { recursive: true });

    let parsedDocument: Record<string, unknown> = {};
    if (companionConfigLocation.readPath && fs.existsSync(companionConfigLocation.readPath)) {
        const originalContent = fs.readFileSync(companionConfigLocation.readPath, 'utf8');
        if (originalContent.trim().length > 0) {
            try {
                const parsed = JSON.parse(originalContent) as unknown;
                if (!isObject(parsed)) {
                    throw new Error('Config root is not a JSON object.');
                }
                parsedDocument = parsed;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Companion config at "${companionConfigLocation.readPath}" is not valid JSON: ${message}`
                );
            }
        }
    }

    parsedDocument.ExportPath = normalizePathForJson(path.join(context.globalStorageUri.fsPath, patchline));
    fs.writeFileSync(companionConfigLocation.writePath, `${JSON.stringify(parsedDocument, null, 4)}\n`, 'utf8');

    if (companionConfigLocation.removeLegacyAfterWrite) {
        tryDeleteLegacyCompanionConfig(workspaceRootPath);
    }
}

function resolveCompanionConfigLocation(workspaceRootPath: string): CompanionConfigLocation {
    const preferredPath = path.join(workspaceRootPath, COMPANION_CONFIG_RELATIVE_PATH);
    const legacyPath = path.join(workspaceRootPath, LEGACY_COMPANION_CONFIG_RELATIVE_PATH);

    if (fs.existsSync(preferredPath)) {
        return {
            readPath: preferredPath,
            writePath: preferredPath,
            removeLegacyAfterWrite: false
        };
    }

    if (fs.existsSync(legacyPath)) {
        return {
            readPath: legacyPath,
            writePath: preferredPath,
            removeLegacyAfterWrite: true
        };
    }

    return {
        writePath: preferredPath,
        removeLegacyAfterWrite: false
    };
}

function tryDeleteLegacyCompanionConfig(workspaceRootPath: string): void {
    const legacyConfigPath = path.join(workspaceRootPath, LEGACY_COMPANION_CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(legacyConfigPath)) {
        return;
    }

    try {
        fs.unlinkSync(legacyConfigPath);
        deleteEmptyDirectoriesUpTo(path.dirname(legacyConfigPath), path.join(workspaceRootPath, 'run'));
    } catch {
        // Keep migration non-fatal if cleanup cannot be completed.
    }
}

function deleteEmptyDirectoriesUpTo(startDirectory: string, stopDirectory: string): void {
    let currentDirectory = startDirectory;
    const normalizedStopDirectory = path.resolve(stopDirectory);

    while (path.resolve(currentDirectory).startsWith(normalizedStopDirectory)) {
        if (path.resolve(currentDirectory) === normalizedStopDirectory) {
            break;
        }

        if (!fs.existsSync(currentDirectory)) {
            break;
        }

        const entries = fs.readdirSync(currentDirectory);
        if (entries.length > 0) {
            break;
        }

        fs.rmdirSync(currentDirectory);
        currentDirectory = path.dirname(currentDirectory);
    }
}

function toSupportedPatchline(value: string): SupportedPatchline {
    if (value === 'pre-release') {
        return 'pre-release';
    }
    return 'release';
}

function normalizePathForJson(value: string): string {
    return value.replace(/\\/g, '/');
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
