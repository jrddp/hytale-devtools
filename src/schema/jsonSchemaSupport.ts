import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    buildManagedSchemaAssociations,
    collectManagedUrls,
    JsonSchemaSettingEntry,
    mergeJsonSchemaAssociations
} from './schemaMappings';

const MANAGED_SCHEMA_URLS_STATE_KEY = 'hytale-devtools.managedJsonSchemaUrls';
const SCHEMA_EXPORTS_DIRECTORY = 'schemas';
const SCHEMA_MAPPINGS_FILE_NAME = 'schemaMappings.json';
const REFRESH_DEBOUNCE_MS = 250;

export function initializeJsonSchemaSupport(context: vscode.ExtensionContext): vscode.Disposable {
    const storageRootPath = context.globalStorageUri.fsPath;
    const schemaRootPath = path.join(context.globalStorageUri.fsPath, SCHEMA_EXPORTS_DIRECTORY);
    const disposables: vscode.Disposable[] = [];

    let isDisposed = false;
    let refreshTimeout: NodeJS.Timeout | undefined;
    let refreshQueue: Promise<void> = Promise.resolve();

    const queueRefresh = () => {
        refreshQueue = refreshQueue
            .catch(() => undefined)
            .then(async () => {
                if (isDisposed) {
                    return;
                }

                try {
                    await refreshJsonSchemaAssociations(context, schemaRootPath);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.warn(`Failed to refresh JSON schema associations: ${message}`);
                }
            });
    };

    const scheduleRefresh = () => {
        if (isDisposed) {
            return;
        }

        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
        }

        refreshTimeout = setTimeout(() => {
            refreshTimeout = undefined;
            queueRefresh();
        }, REFRESH_DEBOUNCE_MS);
    };

    const watchPatterns = [
        new vscode.RelativePattern(storageRootPath, `${SCHEMA_EXPORTS_DIRECTORY}/${SCHEMA_MAPPINGS_FILE_NAME}`),
        new vscode.RelativePattern(storageRootPath, `${SCHEMA_EXPORTS_DIRECTORY}/Schema/*.json`),
        new vscode.RelativePattern(storageRootPath, `${SCHEMA_EXPORTS_DIRECTORY}/Schemas/*.json`)
    ];

    for (const watchPattern of watchPatterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(watchPattern);
        disposables.push(
            watcher,
            watcher.onDidCreate(scheduleRefresh),
            watcher.onDidChange(scheduleRefresh),
            watcher.onDidDelete(scheduleRefresh)
        );
    }

    disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh));

    scheduleRefresh();

    return new vscode.Disposable(() => {
        isDisposed = true;

        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
            refreshTimeout = undefined;
        }

        for (const disposable of disposables) {
            disposable.dispose();
        }
    });
}

async function refreshJsonSchemaAssociations(context: vscode.ExtensionContext, schemaRootPath: string): Promise<void> {
    const hasWorkspace = Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length > 0;
    if (!hasWorkspace) {
        return;
    }

    const previousManagedUrls = context.globalState.get<string[]>(MANAGED_SCHEMA_URLS_STATE_KEY, []);
    const managedSchemas = await loadManagedSchemaSettings(schemaRootPath);
    if (!managedSchemas) {
        return;
    }

    const jsonConfiguration = vscode.workspace.getConfiguration('json');
    const existingSchemas = jsonConfiguration.get<unknown>('schemas');

    const mergedSchemas = mergeJsonSchemaAssociations({
        existingSchemas,
        managedSchemas,
        previousManagedUrls
    });

    const existingSchemaArray = Array.isArray(existingSchemas) ? existingSchemas : [];
    const needsUpdate = !Array.isArray(existingSchemas)
        ? mergedSchemas.length > 0
        : JSON.stringify(existingSchemaArray) !== JSON.stringify(mergedSchemas);

    if (needsUpdate) {
        await jsonConfiguration.update('schemas', mergedSchemas, vscode.ConfigurationTarget.Workspace);
    }

    const nextManagedUrls = collectManagedUrls(managedSchemas);
    await context.globalState.update(MANAGED_SCHEMA_URLS_STATE_KEY, nextManagedUrls);
}

async function loadManagedSchemaSettings(schemaRootPath: string): Promise<JsonSchemaSettingEntry[] | undefined> {
    const mappingFilePath = path.join(schemaRootPath, SCHEMA_MAPPINGS_FILE_NAME);
    const mappingFileContents = await readMappingFileSafely(mappingFilePath);
    if (mappingFileContents === undefined) {
        return undefined;
    }

    const managedAssociations = buildManagedSchemaAssociations({
        rawMappings: mappingFileContents,
        schemaRootPath
    });

    return managedAssociations.map(association => ({
        fileMatch: association.fileMatch,
        url: vscode.Uri.file(association.schemaFilePath).toString()
    }));
}

async function readMappingFileSafely(mappingFilePath: string): Promise<unknown | undefined> {
    try {
        const mappingFileContent = await fs.readFile(mappingFilePath, 'utf8');
        return JSON.parse(mappingFileContent);
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            return { 'json.schemas': [] };
        }

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to read JSON schema mapping file (${mappingFilePath}): ${message}`);
        return undefined;
    }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error;
}
