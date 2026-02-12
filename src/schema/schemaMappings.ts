import * as fs from 'fs';
import * as path from 'path';

export type SchemaDirectoryName = 'Schema' | 'Schemas';

export interface ParsedSchemaMapping {
    fileMatch: string[];
    url: string;
}

export interface ManagedSchemaAssociation {
    fileMatch: string[];
    schemaFilePath: string;
}

export interface JsonSchemaSettingEntry extends Record<string, unknown> {
    fileMatch?: unknown;
    url?: unknown;
}

export interface BuildManagedSchemaAssociationsOptions {
    rawMappings: unknown;
    schemaRootPath: string;
    resourcesRootPath?: string;
    pathExists?: (candidatePath: string) => boolean;
}

export interface MergeJsonSchemaAssociationsOptions {
    existingSchemas: unknown;
    managedSchemas: readonly JsonSchemaSettingEntry[];
    previousManagedUrls: readonly string[];
}

const DEFAULT_RESOURCES_ROOT_PATH = 'src/main/resources';
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:\//;

export function detectSchemaDirectoryName(
    schemaRootPath: string,
    pathExists: (candidatePath: string) => boolean = fs.existsSync
): SchemaDirectoryName {
    const schemaPath = path.join(schemaRootPath, 'Schema');
    if (pathExists(schemaPath)) {
        return 'Schema';
    }

    const schemasPath = path.join(schemaRootPath, 'Schemas');
    if (pathExists(schemasPath)) {
        return 'Schemas';
    }

    return 'Schema';
}

export function parseSchemaMappingsDocument(rawMappings: unknown): ParsedSchemaMapping[] {
    if (!isObject(rawMappings)) {
        return [];
    }

    const mappingsValue = rawMappings['json.schemas'];
    if (!Array.isArray(mappingsValue)) {
        return [];
    }

    const mappings: ParsedSchemaMapping[] = [];

    for (const mappingCandidate of mappingsValue) {
        if (!isObject(mappingCandidate)) {
            continue;
        }

        const url = typeof mappingCandidate.url === 'string' ? mappingCandidate.url.trim() : '';
        if (!url) {
            continue;
        }

        const fileMatch = toStringArray(mappingCandidate.fileMatch);
        if (fileMatch.length === 0) {
            continue;
        }

        mappings.push({
            fileMatch,
            url
        });
    }

    return mappings;
}

export function toWorkspaceFileMatchPatterns(
    fileMatch: readonly string[],
    resourcesRootPath: string = DEFAULT_RESOURCES_ROOT_PATH
): string[] {
    const normalizedResourcesRoot = trimSlashes(normalizeSlashes(resourcesRootPath));
    if (!normalizedResourcesRoot) {
        return [];
    }

    const workspacePatterns: string[] = [];
    const seenPatterns = new Set<string>();

    for (const candidate of fileMatch) {
        if (typeof candidate !== 'string') {
            continue;
        }

        const normalized = trimSlashes(normalizeSlashes(candidate.trim()));
        if (!normalized) {
            continue;
        }

        const workspacePattern = `**/${normalizedResourcesRoot}/${normalized}`;
        if (seenPatterns.has(workspacePattern)) {
            continue;
        }

        seenPatterns.add(workspacePattern);
        workspacePatterns.push(workspacePattern);
    }

    return workspacePatterns;
}

export function resolveMappingUrlToSchemaPath(
    schemaRootPath: string,
    mappingUrl: string,
    preferredSchemaDirectoryName: SchemaDirectoryName,
    pathExists: (candidatePath: string) => boolean = fs.existsSync
): string | undefined {
    const normalizedUrl = normalizeSlashes(mappingUrl.trim());
    if (!normalizedUrl) {
        return undefined;
    }

    if (URL_SCHEME_PATTERN.test(normalizedUrl)) {
        return undefined;
    }

    if (path.isAbsolute(normalizedUrl) || WINDOWS_DRIVE_PATH_PATTERN.test(normalizedUrl)) {
        return pathExists(normalizedUrl) ? path.resolve(normalizedUrl) : undefined;
    }

    const relativeUrl = toRelativeMappingPath(normalizedUrl);
    const alternateSchemaDirectoryName = preferredSchemaDirectoryName === 'Schema' ? 'Schemas' : 'Schema';

    const candidateRelativePaths = dedupeValues([
        applySchemaDirectoryName(relativeUrl, preferredSchemaDirectoryName),
        relativeUrl,
        applySchemaDirectoryName(relativeUrl, alternateSchemaDirectoryName)
    ]);

    for (const candidateRelativePath of candidateRelativePaths) {
        const absolutePath = path.resolve(schemaRootPath, candidateRelativePath);
        if (pathExists(absolutePath)) {
            return absolutePath;
        }
    }

    return undefined;
}

export function buildManagedSchemaAssociations(
    options: BuildManagedSchemaAssociationsOptions
): ManagedSchemaAssociation[] {
    const pathExists = options.pathExists ?? fs.existsSync;
    const schemaDirectoryName = detectSchemaDirectoryName(options.schemaRootPath, pathExists);
    const parsedMappings = parseSchemaMappingsDocument(options.rawMappings);

    const associations: ManagedSchemaAssociation[] = [];
    const seenAssociationKeys = new Set<string>();

    for (const mapping of parsedMappings) {
        const fileMatch = toWorkspaceFileMatchPatterns(mapping.fileMatch, options.resourcesRootPath);
        if (fileMatch.length === 0) {
            continue;
        }

        const schemaFilePath = resolveMappingUrlToSchemaPath(
            options.schemaRootPath,
            mapping.url,
            schemaDirectoryName,
            pathExists
        );
        if (!schemaFilePath) {
            continue;
        }

        const associationKey = `${normalizeSlashes(path.resolve(schemaFilePath))}::${[...fileMatch].sort().join('|')}`;
        if (seenAssociationKeys.has(associationKey)) {
            continue;
        }

        seenAssociationKeys.add(associationKey);
        associations.push({
            fileMatch,
            schemaFilePath: path.resolve(schemaFilePath)
        });
    }

    return associations;
}

export function mergeJsonSchemaAssociations(options: MergeJsonSchemaAssociationsOptions): unknown[] {
    const existingEntries = Array.isArray(options.existingSchemas) ? options.existingSchemas : [];
    const previousManagedUrls = new Set(options.previousManagedUrls);

    const mergedEntries: unknown[] = [];
    const seenAssociationKeys = new Set<string>();

    for (const existingEntry of existingEntries) {
        if (isEntryWithManagedUrl(existingEntry, previousManagedUrls)) {
            continue;
        }

        appendSchemaEntry(existingEntry, mergedEntries, seenAssociationKeys);
    }

    for (const managedEntry of options.managedSchemas) {
        appendSchemaEntry(managedEntry, mergedEntries, seenAssociationKeys);
    }

    return mergedEntries;
}

export function collectManagedUrls(managedSchemas: readonly JsonSchemaSettingEntry[]): string[] {
    const managedUrls: string[] = [];
    const seenUrls = new Set<string>();

    for (const entry of managedSchemas) {
        const url = typeof entry.url === 'string' ? entry.url : undefined;
        if (!url || seenUrls.has(url)) {
            continue;
        }

        seenUrls.add(url);
        managedUrls.push(url);
    }

    return managedUrls;
}

function appendSchemaEntry(entry: unknown, mergedEntries: unknown[], seenAssociationKeys: Set<string>): void {
    const associationKey = getAssociationDedupKey(entry);
    if (associationKey) {
        if (seenAssociationKeys.has(associationKey)) {
            return;
        }

        seenAssociationKeys.add(associationKey);
    }

    mergedEntries.push(entry);
}

function getAssociationDedupKey(entry: unknown): string | undefined {
    if (!isObject(entry)) {
        return undefined;
    }

    const url = typeof entry.url === 'string' ? entry.url : undefined;
    if (!url) {
        return undefined;
    }

    if (!Array.isArray(entry.fileMatch)) {
        return undefined;
    }

    const normalizedFileMatch = entry.fileMatch
        .filter((value): value is string => typeof value === 'string')
        .map(value => normalizeSlashes(value.trim()))
        .filter(value => value.length > 0)
        .sort();

    if (normalizedFileMatch.length === 0) {
        return undefined;
    }

    return `${url}::${normalizedFileMatch.join('|')}`;
}

function isEntryWithManagedUrl(entry: unknown, previousManagedUrls: Set<string>): boolean {
    if (!isObject(entry)) {
        return false;
    }

    const url = typeof entry.url === 'string' ? entry.url : undefined;
    return !!url && previousManagedUrls.has(url);
}

function toRelativeMappingPath(mappingUrl: string): string {
    let relativePath = mappingUrl;
    if (relativePath.startsWith('./')) {
        relativePath = relativePath.substring(2);
    }

    return trimLeadingSlashes(relativePath);
}

function applySchemaDirectoryName(relativePath: string, schemaDirectoryName: SchemaDirectoryName): string {
    return relativePath.replace(/^schemas?\//i, `${schemaDirectoryName}/`);
}

function toStringArray(value: unknown): string[] {
    if (typeof value === 'string') {
        const normalizedValue = value.trim();
        return normalizedValue ? [normalizedValue] : [];
    }

    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((candidate): candidate is string => typeof candidate === 'string')
        .map(candidate => candidate.trim())
        .filter(candidate => candidate.length > 0);
}

function normalizeSlashes(value: string): string {
    return value.replace(/\\/g, '/');
}

function trimLeadingSlashes(value: string): string {
    return value.replace(/^\/+/, '');
}

function trimSlashes(value: string): string {
    return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function dedupeValues(values: string[]): string[] {
    const seenValues = new Set<string>();
    const uniqueValues: string[] = [];

    for (const value of values) {
        if (!value || seenValues.has(value)) {
            continue;
        }

        seenValues.add(value);
        uniqueValues.push(value);
    }

    return uniqueValues;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
