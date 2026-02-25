import * as path from 'path';
import { type CompanionSchemaMappingsDocument, type SchemaMappingRule } from './types';

interface SchemaMappingEntryCandidate {
    fileMatch?: unknown;
    url?: unknown;
}

export function parseSchemaMappingRules(document: CompanionSchemaMappingsDocument): SchemaMappingRule[] {
    if (!isRecord(document.schemaMappings)) {
        return [];
    }

    const schemaMappings = document.schemaMappings;
    const jsonSchemas = schemaMappings['json.schemas'];
    if (!Array.isArray(jsonSchemas)) {
        return [];
    }

    const rules: SchemaMappingRule[] = [];
    for (const candidate of jsonSchemas) {
        if (!isRecord(candidate)) {
            continue;
        }

        const parsedEntry = parseSchemaMappingEntry(candidate as SchemaMappingEntryCandidate);
        if (!parsedEntry) {
            continue;
        }

        rules.push(parsedEntry);
    }

    return rules;
}

export function matchSchemaFileForAssetPath(assetFilePath: string, rules: readonly SchemaMappingRule[]): string | undefined {
    const normalizedAssetPath = normalizeAssetPathForMatching(assetFilePath);
    for (const rule of rules) {
        if (rule.compiledPatterns.some(pattern => pattern.test(normalizedAssetPath))) {
            return rule.schemaFileName;
        }
    }
    return undefined;
}

export function normalizeAssetPathForMatching(assetFilePath: string): string {
    const normalized = normalizePath(assetFilePath);
    const marker = '/src/main/resources/';
    const markerIndex = normalized.indexOf(marker);
    const pathRelativeToResources = markerIndex >= 0
        ? normalized.slice(markerIndex + marker.length)
        : normalized;
    const withLeadingSlash = pathRelativeToResources.startsWith('/')
        ? pathRelativeToResources
        : `/${pathRelativeToResources}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/');
}

export function normalizeSchemaUrlToSchemaFileName(schemaUrl: string): string {
    const normalized = normalizePath(schemaUrl).replace(/^\.\//, '');
    if (!normalized) {
        return '';
    }

    return path.posix.basename(normalized);
}

export function globToRegExp(globPattern: string): RegExp {
    const normalized = normalizePath(globPattern);
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;

    let source = '^';
    for (let index = 0; index < withLeadingSlash.length; index += 1) {
        const char = withLeadingSlash[index];

        if (char === '*') {
            const next = withLeadingSlash[index + 1];
            if (next === '*') {
                const afterDoubleStar = withLeadingSlash[index + 2];
                if (afterDoubleStar === '/') {
                    source += '(?:.*/)?';
                    index += 2;
                    continue;
                }

                source += '.*';
                index += 1;
                continue;
            }

            source += '[^/]*';
            continue;
        }

        if (char === '?') {
            source += '[^/]';
            continue;
        }

        source += escapeForRegExp(char);
    }

    source += '$';
    return new RegExp(source);
}

function parseSchemaMappingEntry(candidate: SchemaMappingEntryCandidate): SchemaMappingRule | undefined {
    const fileMatch = Array.isArray(candidate.fileMatch)
        ? candidate.fileMatch.filter((value): value is string => typeof value === 'string')
        : [];
    const schemaUrl = typeof candidate.url === 'string' ? candidate.url : '';
    const schemaFileName = normalizeSchemaUrlToSchemaFileName(schemaUrl);

    if (fileMatch.length === 0 || !schemaFileName) {
        return undefined;
    }

    return {
        fileMatch,
        schemaFileName,
        compiledPatterns: fileMatch.map(globToRegExp)
    };
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
