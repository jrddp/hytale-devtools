export type CompanionSnapshotStateKind = 'idle' | 'loading' | 'ready' | 'missing_exports' | 'error';

export interface CompanionSnapshotState {
    kind: CompanionSnapshotStateKind;
    updatedAt: number;
    message?: string;
}

export interface CompanionSchemaMappingsDocument {
    hytaleVersion?: unknown;
    generatedAt?: unknown;
    schemaMappings?: unknown;
}

export interface SchemaMappingRule {
    fileMatch: string[];
    schemaFileName: string;
    compiledPatterns: RegExp[];
}

export interface PropertyNodeData {
    propertyKey: string;
    schemaFile: string;
    jsonPointer: string;
    propertyName: string;
    node: Record<string, unknown>;
    hytaleDevtools?: Record<string, unknown>;
}

export interface LoadedIndexShard {
    path: string;
    indexKind: string;
    key: string;
    values: unknown;
    hytaleVersion?: string;
    generatedAt?: string;
}

export interface CompanionSnapshot {
    exportRoot: string;
    hytaleVersion?: string;
    generatedAt?: string;
    schemaMappings: CompanionSchemaMappingsDocument;
    mappingRules: SchemaMappingRule[];
    rawSchemas: Map<string, unknown>;
    resolvedSchemas: Map<string, unknown>;
    propertyByKey: Map<string, PropertyNodeData>;
    indexShards: Map<string, LoadedIndexShard>;
}

export interface ResolvePropertyRequest {
    workspacePath: string;
    assetFilePath: string;
    jsonPointer: string;
}

export type ResolvePropertyResult =
    | {
        kind: 'ready';
        schemaFile: string;
        property: PropertyNodeData;
    }
    | {
        kind: 'loading';
        message: string;
    }
    | {
        kind: 'missing_exports';
        message: string;
    }
    | {
        kind: 'schema_unresolved';
        message: string;
    }
    | {
        kind: 'property_missing';
        message: string;
    }
    | {
        kind: 'error';
        message: string;
    };
