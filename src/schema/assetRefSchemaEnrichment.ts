import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { detectSchemaDirectoryName } from './schemaMappings';

const execFileAsync = util.promisify(cp.execFile);

const STORE_INFO_FILE_CANDIDATES = ['stores_info.json', 'stores-info.json'] as const;
const ENRICHED_SCHEMA_ROOT_DIRECTORY = 'vscode';
const ENRICHED_SCHEMA_VERSION = 1;
const KNOWN_VALUES_FILE_NAME = 'hytale-known-values.json';
const METADATA_FILE_NAME = 'metadata.json';
const ZIP_LIST_MAX_BUFFER_BYTES = 1024 * 1024 * 50;

export interface StoreInfoEntry {
    assetSimpleName: string;
    path: string;
    extension: string;
    assetCount?: number;
}

export interface EnsureEnrichedSchemaBundleOptions {
    schemaRootPath: string;
    workspaceRootPaths: readonly string[];
    patchline: string;
    assetsZipPath: string;
}

export interface EnsureEnrichedSchemaBundleResult {
    schemaPathOverrides: Map<string, string>;
}

interface StoreDescriptor {
    assetSimpleName: string;
    path: string;
    pathLower: string;
    extension: string;
    extensionLower: string;
    pathPrefixLower: string;
}

interface WorkspaceServerFile {
    serverRelativePath: string;
    signatureToken: string;
}

interface SourceSignature {
    schemaDirectoryName: string;
    schemaFingerprint: string;
    storesInfoFingerprint: string;
    workspaceFingerprint: string;
    workspaceRootsFingerprint: string;
    patchline: string;
    assetsZipFingerprint: string;
}

interface EnrichedMetadata {
    version: number;
    sourceSignature: SourceSignature;
    generatedAt: string;
    schemaFileCount: number;
    knownValueTypeCount: number;
}

interface JsonSchemaObject {
    [key: string]: unknown;
}

interface KnownValuesDocument {
    $schema: string;
    $id: string;
    title: string;
    $defs: Record<string, unknown>;
}

export async function ensureEnrichedSchemaBundle(
    options: EnsureEnrichedSchemaBundleOptions
): Promise<EnsureEnrichedSchemaBundleResult | undefined> {
    const schemaDirectoryName = detectSchemaDirectoryName(options.schemaRootPath);
    const rawSchemaDirectoryPath = path.join(options.schemaRootPath, schemaDirectoryName);
    if (!fs.existsSync(rawSchemaDirectoryPath)) {
        return undefined;
    }

    const rawSchemaFileNames = listJsonFileNames(rawSchemaDirectoryPath);
    if (rawSchemaFileNames.length === 0) {
        return undefined;
    }

    const storesInfoPath = resolveStoresInfoPath(options.schemaRootPath);
    if (!storesInfoPath) {
        return undefined;
    }

    const storesInfoEntries = await loadStoreInfoEntries(storesInfoPath);
    if (storesInfoEntries.length === 0) {
        return undefined;
    }

    const workspaceServerFiles = await listWorkspaceServerFiles(options.workspaceRootPaths);

    const workspaceKey = computeWorkspaceKey(options.workspaceRootPaths);
    const enrichedRootPath = path.join(
        options.schemaRootPath,
        ENRICHED_SCHEMA_ROOT_DIRECTORY,
        workspaceKey,
        normalizePathSegment(options.patchline || 'release')
    );
    const enrichedSchemaDirectoryPath = path.join(enrichedRootPath, 'Schema');
    const knownValuesFilePath = path.join(enrichedRootPath, KNOWN_VALUES_FILE_NAME);
    const metadataPath = path.join(enrichedRootPath, METADATA_FILE_NAME);

    const sourceSignature = buildSourceSignature({
        schemaDirectoryName,
        rawSchemaDirectoryPath,
        rawSchemaFileNames,
        storesInfoPath,
        workspaceRootPaths: options.workspaceRootPaths,
        workspaceServerFiles,
        patchline: options.patchline,
        assetsZipPath: options.assetsZipPath
    });

    const shouldReuseCache = await isCacheReusable({
        metadataPath,
        sourceSignature,
        enrichedSchemaDirectoryPath,
        knownValuesFilePath,
        rawSchemaFileNames
    });
    if (shouldReuseCache) {
        return {
            schemaPathOverrides: buildSchemaPathOverrides(rawSchemaDirectoryPath, enrichedSchemaDirectoryPath, rawSchemaFileNames)
        };
    }

    const storeDescriptors = toStoreDescriptors(storesInfoEntries);

    const baseGameIndex = await loadBaseGameAssetIndex(options.assetsZipPath, storeDescriptors);
    const workspaceIndex = mapServerRelativePathsToAssetIds(
        workspaceServerFiles.map(file => file.serverRelativePath),
        storesInfoEntries
    );
    const mergedAssetIds = mergeAssetIdIndexes(baseGameIndex, workspaceIndex);

    await fs.promises.mkdir(enrichedSchemaDirectoryPath, { recursive: true });
    await clearDirectoryJsonFiles(enrichedSchemaDirectoryPath);

    const knownValuesDocument = buildKnownValuesDocument(mergedAssetIds);
    await fs.promises.writeFile(knownValuesFilePath, `${JSON.stringify(knownValuesDocument, null, 2)}\n`, 'utf8');

    for (const schemaFileName of rawSchemaFileNames) {
        const rawSchemaFilePath = path.join(rawSchemaDirectoryPath, schemaFileName);
        const enrichedSchemaFilePath = path.join(enrichedSchemaDirectoryPath, schemaFileName);
        const rawSchemaContents = await fs.promises.readFile(rawSchemaFilePath, 'utf8');
        const rawSchemaDocument = JSON.parse(rawSchemaContents) as unknown;
        const enrichedSchemaDocument = enrichSchemaDocumentForAssetRefs(rawSchemaDocument, mergedAssetIds);
        await fs.promises.writeFile(enrichedSchemaFilePath, `${JSON.stringify(enrichedSchemaDocument, null, 2)}\n`, 'utf8');
    }

    const metadata: EnrichedMetadata = {
        version: ENRICHED_SCHEMA_VERSION,
        sourceSignature,
        generatedAt: new Date().toISOString(),
        schemaFileCount: rawSchemaFileNames.length,
        knownValueTypeCount: Object.keys(knownValuesDocument.$defs).length
    };
    await fs.promises.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    return {
        schemaPathOverrides: buildSchemaPathOverrides(rawSchemaDirectoryPath, enrichedSchemaDirectoryPath, rawSchemaFileNames)
    };
}

export function parseStoreInfoEntries(document: unknown): StoreInfoEntry[] {
    if (!isObject(document)) {
        return [];
    }

    const storesRaw = document.stores;
    if (!Array.isArray(storesRaw)) {
        return [];
    }

    const stores: StoreInfoEntry[] = [];
    const seenKeys = new Set<string>();

    for (const candidate of storesRaw) {
        if (!isObject(candidate)) {
            continue;
        }

        const assetSimpleName = typeof candidate.assetSimpleName === 'string' ? candidate.assetSimpleName.trim() : '';
        const storePath = typeof candidate.path === 'string' ? normalizeZipPath(candidate.path) : '';
        const extension = typeof candidate.extension === 'string' ? normalizeStoreExtension(candidate.extension) : '';
        const assetCount = typeof candidate.assetCount === 'number' ? candidate.assetCount : undefined;

        if (!assetSimpleName || !storePath) {
            continue;
        }

        const dedupeKey = `${assetSimpleName}::${storePath}::${extension}`;
        if (seenKeys.has(dedupeKey)) {
            continue;
        }

        seenKeys.add(dedupeKey);
        stores.push({
            assetSimpleName,
            path: storePath,
            extension,
            assetCount
        });
    }

    stores.sort((left, right) => left.assetSimpleName.localeCompare(right.assetSimpleName));
    return stores;
}

export function mapServerRelativePathsToAssetIds(
    serverRelativePaths: readonly string[],
    stores: readonly StoreInfoEntry[]
): Map<string, string[]> {
    const descriptors = toStoreDescriptors(stores);
    return mapServerRelativePathsToAssetIdsWithDescriptors(serverRelativePaths, descriptors);
}

export function enrichSchemaDocumentForAssetRefs(
    schemaDocument: unknown,
    knownAssetValuesByType: Map<string, readonly string[]>
): unknown {
    const availableRefNames = new Set<string>();
    for (const [assetType, values] of knownAssetValuesByType.entries()) {
        if (values.length > 0) {
            availableRefNames.add(assetType);
        }
    }

    return transformSchemaValue(schemaDocument, availableRefNames);
}

export function computeWorkspaceKey(workspaceRootPaths: readonly string[]): string {
    const normalizedPaths = [...workspaceRootPaths]
        .map(rootPath => normalizeZipPath(path.resolve(rootPath)))
        .sort((left, right) => left.localeCompare(right));

    const hash = crypto.createHash('sha1');
    for (const normalizedPath of normalizedPaths) {
        hash.update(normalizedPath);
        hash.update('\n');
    }

    return hash.digest('hex');
}

function buildKnownValuesDocument(knownAssetValuesByType: Map<string, readonly string[]>): KnownValuesDocument {
    const defs: Record<string, unknown> = {};

    for (const assetType of [...knownAssetValuesByType.keys()].sort((left, right) => left.localeCompare(right))) {
        const values = knownAssetValuesByType.get(assetType);
        if (!values || values.length === 0) {
            continue;
        }

        defs[assetType] = {
            type: 'string',
            enum: values
        };
    }

    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: KNOWN_VALUES_FILE_NAME,
        title: 'Hytale Known Asset IDs',
        $defs: defs
    };
}

function transformSchemaValue(value: unknown, availableRefNames: Set<string>): unknown {
    if (Array.isArray(value)) {
        return value.map(item => transformSchemaValue(item, availableRefNames));
    }

    if (!isObject(value)) {
        return value;
    }

    const transformedObject: JsonSchemaObject = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        transformedObject[key] = transformSchemaValue(nestedValue, availableRefNames);
    }

    const hytaleAssetRef = typeof transformedObject.hytaleAssetRef === 'string' ? transformedObject.hytaleAssetRef.trim() : '';
    if (!hytaleAssetRef || !availableRefNames.has(hytaleAssetRef)) {
        return transformedObject;
    }

    const knownValuesRef = `../${KNOWN_VALUES_FILE_NAME}#/$defs/${escapeJsonPointerToken(hytaleAssetRef)}`;
    if (hasRefEntry(transformedObject.anyOf, knownValuesRef) || hasRefEntry(transformedObject.oneOf, knownValuesRef)) {
        return transformedObject;
    }

    if (Array.isArray(transformedObject.anyOf)) {
        return {
            ...transformedObject,
            anyOf: [{ $ref: knownValuesRef }, ...transformedObject.anyOf]
        };
    }

    if (Array.isArray(transformedObject.oneOf)) {
        return {
            ...transformedObject,
            oneOf: [{ $ref: knownValuesRef }, ...transformedObject.oneOf]
        };
    }

    const fallbackType = transformedObject.type ?? 'string';
    return {
        ...transformedObject,
        anyOf: [
            { $ref: knownValuesRef },
            { type: fallbackType }
        ]
    };
}

function hasRefEntry(compositeCandidate: unknown, schemaRef: string): boolean {
    if (!Array.isArray(compositeCandidate)) {
        return false;
    }

    return compositeCandidate.some(item => isObject(item) && item.$ref === schemaRef);
}

function escapeJsonPointerToken(value: string): string {
    return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

async function loadStoreInfoEntries(storesInfoPath: string): Promise<StoreInfoEntry[]> {
    try {
        const storesInfoContent = await fs.promises.readFile(storesInfoPath, 'utf8');
        const storesInfoDocument = JSON.parse(storesInfoContent) as unknown;
        return parseStoreInfoEntries(storesInfoDocument);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to parse store info file (${storesInfoPath}): ${message}`);
        return [];
    }
}

function resolveStoresInfoPath(schemaRootPath: string): string | undefined {
    for (const fileName of STORE_INFO_FILE_CANDIDATES) {
        const candidatePath = path.join(schemaRootPath, fileName);
        if (fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }

    return undefined;
}

function listJsonFileNames(directoryPath: string): string[] {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    return entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

async function listWorkspaceServerFiles(workspaceRootPaths: readonly string[]): Promise<WorkspaceServerFile[]> {
    const files: WorkspaceServerFile[] = [];

    for (const workspaceRootPath of workspaceRootPaths) {
        const serverRootPath = path.join(workspaceRootPath, 'src', 'main', 'resources', 'Server');
        if (!fs.existsSync(serverRootPath)) {
            continue;
        }

        const workspaceFiles = await listFilesRecursively(serverRootPath);
        for (const workspaceFilePath of workspaceFiles) {
            const serverRelativePath = normalizeZipPath(path.relative(serverRootPath, workspaceFilePath));
            files.push({
                serverRelativePath,
                signatureToken: `${normalizeZipPath(path.resolve(workspaceRootPath))}|${serverRelativePath}`
            });
        }
    }

    files.sort((left, right) => left.signatureToken.localeCompare(right.signatureToken));
    return files;
}

async function listFilesRecursively(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    const stack = [rootPath];

    while (stack.length > 0) {
        const currentDirectory = stack.pop();
        if (!currentDirectory) {
            continue;
        }

        const entries = await fs.promises.readdir(currentDirectory, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                stack.push(absolutePath);
                continue;
            }

            if (entry.isFile()) {
                files.push(absolutePath);
            }
        }
    }

    return files;
}

async function loadBaseGameAssetIndex(
    assetsZipPath: string,
    storeDescriptors: readonly StoreDescriptor[]
): Promise<Map<string, string[]>> {
    if (!assetsZipPath || !fs.existsSync(assetsZipPath)) {
        return new Map<string, string[]>();
    }

    let stdout: string;
    try {
        const result = await execFileAsync('unzip', ['-Z1', assetsZipPath], {
            maxBuffer: ZIP_LIST_MAX_BUFFER_BYTES
        });
        stdout = result.stdout;
    } catch (error) {
        const message = toUnzipErrorMessage(error);
        console.warn(`Failed to list base-game assets from Assets.zip (${assetsZipPath}): ${message}`);
        return new Map<string, string[]>();
    }

    const serverRelativePaths = stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => line.startsWith('Server/'))
        .filter(line => !line.endsWith('/'))
        .map(line => line.substring('Server/'.length));

    return mapServerRelativePathsToAssetIdsWithDescriptors(serverRelativePaths, storeDescriptors);
}

function mapServerRelativePathsToAssetIdsWithDescriptors(
    serverRelativePaths: readonly string[],
    stores: readonly StoreDescriptor[] | readonly StoreInfoEntry[]
): Map<string, string[]> {
    const descriptors = stores.length > 0 && isStoreDescriptor(stores[0])
        ? stores as readonly StoreDescriptor[]
        : toStoreDescriptors(stores as readonly StoreInfoEntry[]);

    const valuesByType = new Map<string, Set<string>>();

    for (const serverRelativePath of serverRelativePaths) {
        const match = resolveStoreMatch(serverRelativePath, descriptors);
        if (!match) {
            continue;
        }

        const assetId = toAssetId(match.relativePath, match.store.extension);
        if (!assetId) {
            continue;
        }

        if (!valuesByType.has(match.store.assetSimpleName)) {
            valuesByType.set(match.store.assetSimpleName, new Set<string>());
        }
        valuesByType.get(match.store.assetSimpleName)?.add(assetId);
    }

    const indexedValues = new Map<string, string[]>();
    for (const [assetType, values] of valuesByType.entries()) {
        indexedValues.set(assetType, [...values].sort((left, right) => left.localeCompare(right)));
    }

    return indexedValues;
}

function isStoreDescriptor(value: unknown): value is StoreDescriptor {
    return isObject(value) && typeof value.assetSimpleName === 'string' && typeof value.pathPrefixLower === 'string';
}

function toStoreDescriptors(stores: readonly StoreInfoEntry[]): StoreDescriptor[] {
    return stores.map(store => {
        const storePath = normalizeZipPath(store.path);
        const extension = normalizeStoreExtension(store.extension);
        const pathLower = storePath.toLowerCase();
        const extensionLower = extension.toLowerCase();

        return {
            assetSimpleName: store.assetSimpleName,
            path: storePath,
            pathLower,
            extension,
            extensionLower,
            pathPrefixLower: `${pathLower}/`
        };
    });
}

function resolveStoreMatch(
    serverRelativePath: string,
    storeDescriptors: readonly StoreDescriptor[]
): { store: StoreDescriptor; relativePath: string } | undefined {
    const normalizedPath = normalizeZipPath(serverRelativePath);
    const normalizedPathLower = normalizedPath.toLowerCase();

    let bestMatch: { store: StoreDescriptor; relativePath: string } | undefined;
    let bestMatchPathLength = -1;
    let bestMatchExtensionLength = -1;

    for (const descriptor of storeDescriptors) {
        if (!normalizedPathLower.startsWith(descriptor.pathPrefixLower)) {
            continue;
        }

        const relativePath = normalizedPath.substring(descriptor.path.length + 1);
        if (!relativePath) {
            continue;
        }

        if (descriptor.extensionLower && !relativePath.toLowerCase().endsWith(descriptor.extensionLower)) {
            continue;
        }

        if (
            descriptor.path.length > bestMatchPathLength ||
            (descriptor.path.length === bestMatchPathLength && descriptor.extension.length > bestMatchExtensionLength)
        ) {
            bestMatch = {
                store: descriptor,
                relativePath
            };
            bestMatchPathLength = descriptor.path.length;
            bestMatchExtensionLength = descriptor.extension.length;
        }
    }

    return bestMatch;
}

function toAssetId(relativePath: string, extension: string): string {
    const normalizedPath = normalizeZipPath(relativePath);
    if (!normalizedPath) {
        return '';
    }

    const normalizedExtension = normalizeStoreExtension(extension);
    if (!normalizedExtension) {
        return normalizedPath;
    }

    const normalizedPathLower = normalizedPath.toLowerCase();
    const extensionLower = normalizedExtension.toLowerCase();
    if (!normalizedPathLower.endsWith(extensionLower)) {
        return normalizedPath;
    }

    const idWithoutExtension = normalizedPath.substring(0, normalizedPath.length - normalizedExtension.length);
    return normalizeZipPath(idWithoutExtension);
}

function mergeAssetIdIndexes(
    ...indexes: Array<Map<string, readonly string[]>>
): Map<string, string[]> {
    const mergedValues = new Map<string, Set<string>>();

    for (const index of indexes) {
        for (const [assetType, values] of index.entries()) {
            if (!mergedValues.has(assetType)) {
                mergedValues.set(assetType, new Set<string>());
            }

            const targetSet = mergedValues.get(assetType);
            for (const value of values) {
                targetSet?.add(value);
            }
        }
    }

    const mergedIndex = new Map<string, string[]>();
    for (const [assetType, values] of mergedValues.entries()) {
        mergedIndex.set(assetType, [...values].sort((left, right) => left.localeCompare(right)));
    }
    return mergedIndex;
}

async function clearDirectoryJsonFiles(directoryPath: string): Promise<void> {
    if (!fs.existsSync(directoryPath)) {
        return;
    }

    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
            continue;
        }

        await fs.promises.unlink(path.join(directoryPath, entry.name));
    }
}

function buildSchemaPathOverrides(
    rawSchemaDirectoryPath: string,
    enrichedSchemaDirectoryPath: string,
    rawSchemaFileNames: readonly string[]
): Map<string, string> {
    const overrides = new Map<string, string>();

    for (const schemaFileName of rawSchemaFileNames) {
        const rawPath = path.resolve(rawSchemaDirectoryPath, schemaFileName);
        const enrichedPath = path.resolve(enrichedSchemaDirectoryPath, schemaFileName);

        if (!fs.existsSync(enrichedPath)) {
            continue;
        }

        overrides.set(toPathKey(rawPath), enrichedPath);
    }

    return overrides;
}

async function isCacheReusable(options: {
    metadataPath: string;
    sourceSignature: SourceSignature;
    enrichedSchemaDirectoryPath: string;
    knownValuesFilePath: string;
    rawSchemaFileNames: readonly string[];
}): Promise<boolean> {
    if (!fs.existsSync(options.metadataPath)) {
        return false;
    }
    if (!fs.existsSync(options.knownValuesFilePath)) {
        return false;
    }
    if (!fs.existsSync(options.enrichedSchemaDirectoryPath)) {
        return false;
    }

    let metadata: EnrichedMetadata;
    try {
        const metadataContent = await fs.promises.readFile(options.metadataPath, 'utf8');
        metadata = JSON.parse(metadataContent) as EnrichedMetadata;
    } catch {
        return false;
    }

    if (metadata.version !== ENRICHED_SCHEMA_VERSION) {
        return false;
    }

    const signatureMatches = JSON.stringify(metadata.sourceSignature) === JSON.stringify(options.sourceSignature);
    if (!signatureMatches) {
        return false;
    }

    for (const schemaFileName of options.rawSchemaFileNames) {
        const candidateOutputPath = path.join(options.enrichedSchemaDirectoryPath, schemaFileName);
        if (!fs.existsSync(candidateOutputPath)) {
            return false;
        }
    }

    return true;
}

function buildSourceSignature(options: {
    schemaDirectoryName: string;
    rawSchemaDirectoryPath: string;
    rawSchemaFileNames: readonly string[];
    storesInfoPath: string;
    workspaceRootPaths: readonly string[];
    workspaceServerFiles: readonly WorkspaceServerFile[];
    patchline: string;
    assetsZipPath: string;
}): SourceSignature {
    const schemaFingerprint = hashStatEntries(
        options.rawSchemaFileNames.map(fileName => path.join(options.rawSchemaDirectoryPath, fileName))
    );
    const storesInfoFingerprint = hashStatEntries([options.storesInfoPath]);
    const workspaceFingerprint = hashWorkspaceFiles(options.workspaceServerFiles);
    const workspaceRootsFingerprint = hashStrings(options.workspaceRootPaths.map(rootPath => normalizeZipPath(path.resolve(rootPath))));
    const assetsZipFingerprint = hashAssetZip(options.assetsZipPath);

    return {
        schemaDirectoryName: options.schemaDirectoryName,
        schemaFingerprint,
        storesInfoFingerprint,
        workspaceFingerprint,
        workspaceRootsFingerprint,
        patchline: options.patchline,
        assetsZipFingerprint
    };
}

function hashAssetZip(assetsZipPath: string): string {
    if (!assetsZipPath || !fs.existsSync(assetsZipPath)) {
        return 'missing';
    }

    const stat = fs.statSync(assetsZipPath);
    return `${normalizeZipPath(path.resolve(assetsZipPath))}|${stat.size}|${Math.floor(stat.mtimeMs)}`;
}

function hashWorkspaceFiles(files: readonly WorkspaceServerFile[]): string {
    return hashStrings(files.map(file => file.signatureToken));
}

function hashStatEntries(filePaths: readonly string[]): string {
    const statTokens: string[] = [];
    for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) {
            statTokens.push(`${normalizeZipPath(path.resolve(filePath))}|missing`);
            continue;
        }

        const stat = fs.statSync(filePath);
        statTokens.push(`${normalizeZipPath(path.resolve(filePath))}|${stat.size}|${Math.floor(stat.mtimeMs)}`);
    }

    return hashStrings(statTokens);
}

function hashStrings(values: readonly string[]): string {
    const hash = crypto.createHash('sha256');
    for (const value of [...values].sort((left, right) => left.localeCompare(right))) {
        hash.update(value);
        hash.update('\n');
    }

    return hash.digest('hex');
}

function normalizePathSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeZipPath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeStoreExtension(extension: string): string {
    const trimmedExtension = extension.trim().toLowerCase();
    if (!trimmedExtension) {
        return '';
    }

    return trimmedExtension.startsWith('.') ? trimmedExtension : `.${trimmedExtension}`;
}

export function toPathKey(filePath: string): string {
    const normalizedPath = normalizeZipPath(path.resolve(filePath));
    return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

function toUnzipErrorMessage(error: unknown): string {
    if (isObject(error) && 'code' in error && error.code === 'ENOENT') {
        return '"unzip" command not found';
    }

    if (isObject(error) && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
        return error.stderr.trim();
    }

    return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
