import {
    asHytaleDevtoolsPayload,
    type HytaleDevtoolsAssetPathSemantics,
    type HytaleDevtoolsInlineOrReferenceSemantics,
    type HytaleDevtoolsLocalizationLocaleStrategy,
    type HytaleDevtoolsSymbolReferenceSource
} from './hytaleDevtoolsPayload';
import { type LoadedIndexShard } from './companion/types';

const INDEX_KIND_REGISTERED_ASSETS = 'registeredAssets';
const INDEX_KIND_EXPORTS_BY_FAMILY = 'exportsByFamily';
const INDEX_KIND_REFERENCE_BUNDLE = 'referenceBundle';
const INDEX_KIND_LOCALIZATION_KEYS = 'localizationKeys';
const INDEX_KIND_COSMETICS_BY_TYPE = 'cosmeticsByType';
const INDEX_KIND_UI_DATA_SETS = 'uiDataSets';
const INDEX_KIND_COMMON_ASSETS_BY_ROOT = 'commonAssetsByRoot';
const INDEX_KEY_COMMON_ASSETS_ALL = 'all';
const DEFAULT_FALLBACK_LOCALE = 'en-US';

export interface ResolveHytaleDevtoolsValueListOptions {
    indexShards?: ReadonlyMap<string, LoadedIndexShard>;
    activeLocale?: string;
}

export function resolveHytaleDevtoolsValueList(
    payloadCandidate: unknown,
    options: ResolveHytaleDevtoolsValueListOptions = {}
): string[] {
    const payload = asHytaleDevtoolsPayload(payloadCandidate);
    if (!payload) {
        return [];
    }

    switch (payload.semanticKind) {
        case 'literalChoice':
            return normalizeUniqueStringList(payload.values);
        case 'symbolReference':
            return resolveSymbolReferenceValueList(payload.source, options);
        case 'inlineOrReference':
            return resolveInlineOrReferenceValueList(payload, options);
        case 'assetPath':
            return resolveAssetPathValueList(payload, options);
        case 'symbolDefinition':
        case 'color':
        default:
            return [];
    }
}

function resolveInlineOrReferenceValueList(
    payload: HytaleDevtoolsInlineOrReferenceSemantics,
    options: ResolveHytaleDevtoolsValueListOptions
): string[] {
    return resolveSymbolReferenceValueList(payload.referenceSource, options);
}

function resolveSymbolReferenceValueList(
    source: HytaleDevtoolsSymbolReferenceSource,
    options: ResolveHytaleDevtoolsValueListOptions
): string[] {
    switch (source.kind) {
        case 'literalSet':
            return normalizeUniqueStringList(source.allowedValues);
        case 'registryDomain':
            return resolveIndexShardValues(options.indexShards, INDEX_KIND_REGISTERED_ASSETS, source.domain);
        case 'importFamily':
            return resolveIndexShardValues(options.indexShards, INDEX_KIND_EXPORTS_BY_FAMILY, source.family);
        case 'referenceBundle':
            return resolveIndexShardValues(options.indexShards, INDEX_KIND_REFERENCE_BUNDLE, source.bundleType);
        case 'localization':
            return resolveLocalizationValues(options.indexShards, source.localeStrategy, options.activeLocale);
        case 'cosmeticDomain':
            return resolveIndexShardValues(options.indexShards, INDEX_KIND_COSMETICS_BY_TYPE, source.domain);
        case 'parentDomain':
            return resolveIndexShardValues(options.indexShards, INDEX_KIND_REGISTERED_ASSETS, source.domain);
        case 'uiDataSet':
            return resolveIndexShardValues(options.indexShards, INDEX_KIND_UI_DATA_SETS, source.dataSet);
        default:
            return [];
    }
}

function resolveLocalizationValues(
    indexShards: ReadonlyMap<string, LoadedIndexShard> | undefined,
    localeStrategy: HytaleDevtoolsLocalizationLocaleStrategy,
    activeLocaleCandidate: string | undefined
): string[] {
    if (!indexShards || indexShards.size === 0) {
        return [];
    }

    if (localeStrategy === 'allLocales') {
        const combinedValues: string[] = [];
        for (const shard of indexShards.values()) {
            if (shard.indexKind !== INDEX_KIND_LOCALIZATION_KEYS) {
                continue;
            }
            combinedValues.push(...readCandidateValuesFromIndexShard(shard));
        }
        return normalizeUniqueStringList(combinedValues);
    }

    const activeLocale = normalizeNonEmptyString(activeLocaleCandidate);
    const lookupLocales = Array.from(
        new Set(
            [activeLocale, DEFAULT_FALLBACK_LOCALE].filter(
                (candidate): candidate is string => Boolean(candidate)
            )
        )
    );
    for (const locale of lookupLocales) {
        const values = resolveIndexShardValues(indexShards, INDEX_KIND_LOCALIZATION_KEYS, locale);
        if (values.length > 0) {
            return values;
        }
    }

    return [];
}

function resolveAssetPathValueList(
    payload: HytaleDevtoolsAssetPathSemantics,
    options: ResolveHytaleDevtoolsValueListOptions
): string[] {
    const shard = resolveIndexShard(options.indexShards, INDEX_KIND_COMMON_ASSETS_BY_ROOT, INDEX_KEY_COMMON_ASSETS_ALL);
    if (!shard || !isRecord(shard.values)) {
        return [];
    }

    const requiredExtension = normalizeExtensionFilter(payload.requiredExtension);
    const requiredRoots = normalizeRequiredRoots(payload.requiredRoots);
    const candidates: string[] = [];

    for (const [pathKeyCandidate, groupedByTypeCandidate] of Object.entries(shard.values)) {
        const pathKey = normalizePathKey(pathKeyCandidate);
        if (!isRecord(groupedByTypeCandidate)) {
            continue;
        }

        for (const [fileTypeCandidate, fileNamesCandidate] of Object.entries(groupedByTypeCandidate)) {
            const fileType = normalizeNonEmptyString(fileTypeCandidate);
            if (!fileType) {
                continue;
            }
            if (requiredExtension && fileType.toLowerCase() !== requiredExtension) {
                continue;
            }

            if (!Array.isArray(fileNamesCandidate)) {
                continue;
            }
            for (const fileNameCandidate of fileNamesCandidate) {
                const fileName = normalizeNonEmptyString(fileNameCandidate);
                if (!fileName) {
                    continue;
                }

                const candidatePath = pathKey ? `${pathKey}/${fileName}` : fileName;
                if (!matchesRequiredRoots(candidatePath, requiredRoots)) {
                    continue;
                }

                candidates.push(candidatePath);
            }
        }
    }

    return normalizeUniqueStringList(candidates);
}

function resolveIndexShardValues(
    indexShards: ReadonlyMap<string, LoadedIndexShard> | undefined,
    indexKind: string,
    keyCandidate: string
): string[] {
    const shard = resolveIndexShard(indexShards, indexKind, keyCandidate);
    if (!shard) {
        return [];
    }

    return readCandidateValuesFromIndexShard(shard);
}

function resolveIndexShard(
    indexShards: ReadonlyMap<string, LoadedIndexShard> | undefined,
    indexKind: string,
    keyCandidate: string
): LoadedIndexShard | undefined {
    if (!indexShards || indexShards.size === 0) {
        return undefined;
    }

    const key = normalizeNonEmptyString(keyCandidate);
    if (!key) {
        return undefined;
    }

    const directKey = buildIndexShardMapKey(indexKind, key);
    const directMatch = indexShards.get(directKey);
    if (directMatch) {
        return directMatch;
    }

    const normalizedKind = indexKind.toLowerCase();
    const normalizedKey = key.toLowerCase();
    for (const shard of indexShards.values()) {
        if (shard.indexKind.toLowerCase() !== normalizedKind) {
            continue;
        }
        if (shard.key.toLowerCase() !== normalizedKey) {
            continue;
        }
        return shard;
    }

    return undefined;
}

function readCandidateValuesFromIndexShard(shard: LoadedIndexShard): string[] {
    const values = shard.values;
    if (Array.isArray(values)) {
        return normalizeUniqueStringList(values);
    }
    if (!isRecord(values)) {
        return [];
    }

    return normalizeUniqueStringList(Object.keys(values));
}

function buildIndexShardMapKey(indexKind: string, key: string): string {
    return `${indexKind}:${key}`;
}

function normalizeRequiredRoots(rootsCandidate: unknown): string[] {
    if (!Array.isArray(rootsCandidate)) {
        return [];
    }

    const roots: string[] = [];
    for (const rootCandidate of rootsCandidate) {
        const root = normalizePathToken(rootCandidate);
        if (!root) {
            continue;
        }

        const withoutCommonPrefix = root.toLowerCase() === 'common'
            ? ''
            : root.toLowerCase().startsWith('common/')
                ? root.slice('common/'.length)
                : root;
        roots.push(withoutCommonPrefix);
    }

    return normalizeUniqueStringList(roots);
}

function normalizeExtensionFilter(extensionCandidate: unknown): string | undefined {
    const extension = normalizeNonEmptyString(extensionCandidate);
    if (!extension) {
        return undefined;
    }

    return extension.replace(/^\./, '').toLowerCase();
}

function normalizePathKey(pathKeyCandidate: unknown): string {
    const pathKey = normalizePathToken(pathKeyCandidate);
    if (!pathKey || pathKey === '.') {
        return '';
    }

    return pathKey;
}

function matchesRequiredRoots(candidatePath: string, requiredRoots: readonly string[]): boolean {
    if (requiredRoots.length === 0) {
        return true;
    }

    const normalizedPath = normalizePathToken(candidatePath);
    if (!normalizedPath) {
        return false;
    }

    for (const requiredRoot of requiredRoots) {
        if (!requiredRoot) {
            return true;
        }
        if (normalizedPath === requiredRoot || normalizedPath.startsWith(`${requiredRoot}/`)) {
            return true;
        }
    }

    return false;
}

function normalizeUniqueStringList(valuesCandidate: unknown): string[] {
  if (!Array.isArray(valuesCandidate)) {
    return [];
  }

    const seen = new Set<string>();
    const normalizedValues: string[] = [];
    for (const valueCandidate of valuesCandidate) {
        const value = normalizeNonEmptyString(valueCandidate);
        if (!value) {
            continue;
        }
        if (seen.has(value)) {
            continue;
        }

        seen.add(value);
        normalizedValues.push(value);
    }

  normalizedValues.sort(compareAutocompleteValueOrder);
  return normalizedValues;
}

function compareAutocompleteValueOrder(left: string, right: string): number {
  const leftStartsWithStar = left.startsWith('*');
  const rightStartsWithStar = right.startsWith('*');
  if (leftStartsWithStar !== rightStartsWithStar) {
    return leftStartsWithStar ? 1 : -1;
  }

  return left.localeCompare(right);
}

function normalizePathToken(value: unknown): string | undefined {
    const normalized = normalizeNonEmptyString(value);
    if (!normalized) {
        return undefined;
    }

    return normalized.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
