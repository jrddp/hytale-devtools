import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import { getHytaleHome, resolvePatchlineFromWorkspace } from '../utils/hytalePaths';

const execFileAsync = util.promisify(cp.execFile);
const SCHEMA_EXPORTS_DIRECTORY = 'schemas';
const STORE_INFO_FILE_CANDIDATES = ['stores_info.json', 'stores-info.json'] as const;
const ZIP_LIST_MAX_BUFFER_BYTES = 1024 * 1024 * 50;
const ZIP_EXTRACT_MAX_BUFFER_BYTES = 1024 * 1024 * 100;

interface StoreInfoDocument {
    stores?: unknown;
}

interface StoreInfoEntry {
    assetSimpleName: string;
    path: string;
    extension: string;
    assetCount?: number;
}

interface ZipAssetEntry {
    zipEntryPath: string;
    archiveRelativePath: string;
    relativePath: string;
}

export async function copyBaseGameAsset(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace open');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    let stores: StoreInfoEntry[];
    try {
        stores = await loadStoreInfoEntries(context);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to load store information: ${message}`);
        return;
    }

    if (stores.length === 0) {
        vscode.window.showWarningMessage('No asset store data found. Please run the VS Code launch configuration to generate asset information.');
        return;
    }

    const selectedStore = await pickStore(stores);
    if (!selectedStore) {
        return;
    }

    const patchline = resolvePatchlineFromWorkspace(rootPath);
    const assetsZipPath = path.join(getHytaleHome(), 'install', patchline, 'package', 'game', 'latest', 'Assets.zip');
    if (!fs.existsSync(assetsZipPath)) {
        vscode.window.showErrorMessage(`Assets.zip not found for patchline "${patchline}" at: ${assetsZipPath}`);
        return;
    }

    let candidateFiles: ZipAssetEntry[];
    try {
        candidateFiles = await listZipEntriesForStore(assetsZipPath, selectedStore);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to list files from Assets.zip: ${message}`);
        return;
    }

    if (candidateFiles.length === 0) {
        const storePathLabel = normalizeZipPath(selectedStore.path) || '(all assets)';
        vscode.window.showWarningMessage(`No matching files found in Assets.zip for ${storePathLabel}.`);
        return;
    }

    const selectedAsset = await pickAssetFile(candidateFiles, selectedStore, stores);
    if (!selectedAsset) {
        return;
    }

    const renamedFileName = await vscode.window.showInputBox({
        placeHolder: 'Leave blank to override original',
        prompt: 'Enter a new file name for the copied asset',
        validateInput: validateNewFileName
    });

    if (renamedFileName === undefined) {
        return;
    }

    const destinationRelativePath = buildDestinationRelativePath(selectedAsset.relativePath, renamedFileName);
    const destinationDirectory = path.resolve(
        rootPath,
        'src',
        'main',
        'resources',
        ...normalizeZipPath(selectedStore.path).split('/').filter(segment => segment.length > 0)
    );

    const destinationPath = path.resolve(destinationDirectory, ...destinationRelativePath.split('/'));
    if (!isPathWithin(destinationDirectory, destinationPath)) {
        vscode.window.showErrorMessage('Invalid destination path derived from selected asset.');
        return;
    }

    try {
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        await extractZipEntryToFile(assetsZipPath, selectedAsset.zipEntryPath, destinationPath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to copy asset file: ${message}`);
        return;
    }

    const destinationUri = vscode.Uri.file(destinationPath);
    try {
        await vscode.commands.executeCommand('vscode.open', destinationUri);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showWarningMessage(`Copied asset, but failed to open it in editor: ${message}`);
    }

    const relativeDestinationPath = path.relative(rootPath, destinationPath);
    vscode.window.showInformationMessage(`Copied base asset to ${normalizeZipPath(relativeDestinationPath)}.`);
}

async function loadStoreInfoEntries(context: vscode.ExtensionContext): Promise<StoreInfoEntry[]> {
    const schemaRootPath = path.join(context.globalStorageUri.fsPath, SCHEMA_EXPORTS_DIRECTORY);
    for (const candidateName of STORE_INFO_FILE_CANDIDATES) {
        const candidatePath = path.join(schemaRootPath, candidateName);
        if (!fs.existsSync(candidatePath)) {
            continue;
        }

        try {
            const storeInfoContent = await fs.promises.readFile(candidatePath, 'utf8');
            const parsedDocument = JSON.parse(storeInfoContent) as StoreInfoDocument;
            const stores = parseStoreInfoEntries(parsedDocument);
            if (stores.length > 0) {
                return stores;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to parse store info file (${candidatePath}): ${message}`);
        }
    }

    return [];
}

function parseStoreInfoEntries(document: StoreInfoDocument): StoreInfoEntry[] {
    const storesRaw = document.stores;
    if (!Array.isArray(storesRaw)) {
        return [];
    }

    const stores: StoreInfoEntry[] = [];
    const seen = new Set<string>();

    for (const candidate of storesRaw) {
        if (!isObject(candidate)) {
            continue;
        }

        const assetSimpleName = typeof candidate.assetSimpleName === 'string' ? candidate.assetSimpleName.trim() : '';
        const storePath = typeof candidate.path === 'string'
            ? normalizeStorePath(candidate.path, hasDefinedRootPath(candidate))
            : '';
        const extension = typeof candidate.extension === 'string' ? normalizeStoreExtension(candidate.extension) : '';
        const assetCount = typeof candidate.assetCount === 'number' ? candidate.assetCount : undefined;

        if (!assetSimpleName || !storePath) {
            continue;
        }

        const storeKey = `${assetSimpleName}::${storePath}::${extension}`;
        if (seen.has(storeKey)) {
            continue;
        }
        seen.add(storeKey);
        stores.push({
            assetSimpleName,
            path: storePath,
            extension,
            assetCount
        });
    }

    stores.sort((left, right) => {
        const leftCount = left.assetCount ?? 0;
        const rightCount = right.assetCount ?? 0;
        if (leftCount !== rightCount) {
            return rightCount - leftCount;
        }

        return left.assetSimpleName.localeCompare(right.assetSimpleName);
    });
    return stores;
}

async function pickStore(stores: StoreInfoEntry[]): Promise<StoreInfoEntry | undefined> {
    const quickPickItems = [{
        label: 'Search all assets',
        store: {
            assetSimpleName: 'Search all assets',
            path: '',
            extension: ''
        } satisfies StoreInfoEntry
    }, ...stores.map(store => ({
        label: store.assetSimpleName,
        detail: `${store.path}/*${store.extension}`,
        store
    }))];

    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Choose asset store'
    });

    return selectedItem?.store;
}

async function pickAssetFile(
    files: ZipAssetEntry[],
    selectedStore: StoreInfoEntry,
    allStores: StoreInfoEntry[]
): Promise<ZipAssetEntry | undefined> {
    const isAllAssetsSearch = normalizeZipPath(selectedStore.path).length === 0;
    const quickPickItems = files.map(file => ({
        label: path.posix.basename(file.relativePath),
        description: isAllAssetsSearch
            ? resolveAssetStoreDescription(file.archiveRelativePath, allStores)
            : toQuickPickPathDescription(file.relativePath),
        detail: file.archiveRelativePath,
        file
    }));

    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a base-game asset file'
    });

    return selectedItem?.file;
}

async function listZipEntriesForStore(assetsZipPath: string, store: StoreInfoEntry): Promise<ZipAssetEntry[]> {
    const normalizedStorePath = normalizeZipPath(store.path);
    const normalizedExtension = normalizeStoreExtension(store.extension);
    const zipPrefix = normalizedStorePath ? `${normalizedStorePath}/` : '';

    let stdout: string;
    try {
        const result = await execFileAsync('unzip', ['-Z1', assetsZipPath], {
            maxBuffer: ZIP_LIST_MAX_BUFFER_BYTES
        });
        stdout = result.stdout;
    } catch (error) {
        throw toZipCommandError(error, 'list zip entries');
    }

    const entries = stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const files: ZipAssetEntry[] = entries
        .filter(entry => !zipPrefix || entry.startsWith(zipPrefix))
        .filter(entry => !entry.endsWith('/'))
        .filter(entry => !normalizedExtension || entry.toLowerCase().endsWith(normalizedExtension))
        .map(entry => ({
            zipEntryPath: entry,
            archiveRelativePath: entry,
            relativePath: entry.substring(zipPrefix.length)
        }));

    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return files;
}

async function extractZipEntryToFile(assetsZipPath: string, zipEntryPath: string, destinationPath: string): Promise<void> {
    let stdout: string | Buffer;
    try {
        const result = await execFileAsync('unzip', ['-p', assetsZipPath, zipEntryPath], {
            encoding: 'buffer',
            maxBuffer: ZIP_EXTRACT_MAX_BUFFER_BYTES
        });
        stdout = result.stdout;
    } catch (error) {
        throw toZipCommandError(error, 'extract zip entry');
    }

    const data = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, 'utf8');
    await fs.promises.writeFile(destinationPath, data);
}

function buildDestinationRelativePath(relativePath: string, renamedFileName: string): string {
    const normalizedPath = normalizeZipPath(relativePath);
    const directoryPath = path.posix.dirname(normalizedPath);
    const originalFileName = path.posix.basename(normalizedPath);
    const trimmedName = renamedFileName.trim();
    const destinationFileName = trimmedName.length > 0 ? trimmedName : originalFileName;

    return directoryPath === '.' ? destinationFileName : `${directoryPath}/${destinationFileName}`;
}

function validateNewFileName(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    if (trimmed === '.' || trimmed === '..') {
        return 'File name cannot be "." or "..".';
    }

    if (trimmed.includes('/') || trimmed.includes('\\')) {
        return 'File name cannot contain path separators.';
    }

    return undefined;
}

function normalizeZipPath(value: string): string {
    return value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeStorePath(rawPath: string, hasRootPath: boolean): string {
    const normalizedPath = normalizeZipPath(rawPath);
    if (!normalizedPath) {
        return '';
    }

    if (hasRootPath) {
        return normalizedPath;
    }

    const normalizedPathLower = normalizedPath.toLowerCase();
    if (
        normalizedPathLower.startsWith('server/') ||
        normalizedPathLower.startsWith('servers/') ||
        normalizedPathLower.startsWith('common/')
    ) {
        return normalizedPath;
    }

    return `Server/${normalizedPath}`;
}

function toQuickPickPathDescription(relativePath: string): string {
    const directoryPath = path.posix.dirname(relativePath);
    return directoryPath === '.' ? '/' : directoryPath;
}

function resolveAssetStoreDescription(archiveRelativePath: string, stores: StoreInfoEntry[]): string {
    const matchedStore = resolveStoreForArchivePath(archiveRelativePath, stores);
    if (!matchedStore) {
        return '(unknown asset store)';
    }

    return matchedStore.assetSimpleName;
}

function resolveStoreForArchivePath(archiveRelativePath: string, stores: StoreInfoEntry[]): StoreInfoEntry | undefined {
    const normalizedPath = normalizeZipPath(archiveRelativePath).toLowerCase();

    let bestMatch: StoreInfoEntry | undefined;
    let bestPathLength = -1;

    for (const store of stores) {
        const normalizedStorePath = normalizeZipPath(store.path).toLowerCase();
        const matchesPath = normalizedPath === normalizedStorePath || normalizedPath.startsWith(`${normalizedStorePath}/`);
        if (!matchesPath) {
            continue;
        }

        const normalizedExtension = normalizeStoreExtension(store.extension);
        if (normalizedExtension && !normalizedPath.endsWith(normalizedExtension)) {
            continue;
        }

        if (normalizedStorePath.length > bestPathLength) {
            bestMatch = store;
            bestPathLength = normalizedStorePath.length;
        }
    }

    return bestMatch;
}

function normalizeStoreExtension(extension: string): string {
    const trimmedExtension = extension.trim().toLowerCase();
    if (!trimmedExtension) {
        return '';
    }

    return trimmedExtension.startsWith('.') ? trimmedExtension : `.${trimmedExtension}`;
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
    const relativePath = path.relative(rootPath, candidatePath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function toZipCommandError(error: unknown, action: string): Error {
    if (isErrnoException(error) && error.code === 'ENOENT') {
        return new Error(`Failed to ${action}: "unzip" command not found.`);
    }

    if (isExecFileError(error)) {
        const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : '';
        const suffix = stderr ? ` ${stderr}` : '';
        return new Error(`Failed to ${action}.${suffix}`.trim());
    }

    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Failed to ${action}: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function hasDefinedRootPath(value: Record<string, unknown>): boolean {
    return Object.prototype.hasOwnProperty.call(value, 'rootPath');
}

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
    return isObject(value) && 'code' in value;
}

function isExecFileError(value: unknown): value is cp.ExecFileException & { stderr?: unknown } {
    return isObject(value) && ('stderr' in value || 'stdout' in value);
}
