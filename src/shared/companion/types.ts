import { type HytaleDevtoolsPayload } from '../hytaleDevtoolsPayload';

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
    hytaleDevtools?: HytaleDevtoolsPayload;
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

export interface ResolveSchemaDefinitionRequestItem {
    nodeId: string;
    schemaDefinition: string;
}

export interface ResolveSchemaDefinitionsBatchRequest {
    workspacePath: string;
    items: ResolveSchemaDefinitionRequestItem[];
}

export type ResolveSchemaDefinitionResult =
    | {
        kind: 'ready';
        nodeId: string;
        schemaDefinition: string;
        schemaFile: string;
        jsonPointer: string;
        resolvedPointer: string;
        pointerSegments: string[];
        variantIndex: number | null;
        resolvedNode: unknown;
        hytaleDevtools?: HytaleDevtoolsPayload;
        autocompleteValuesBySchemaKey?: Record<string, string[]>;
    }
    | {
        kind: 'loading';
        nodeId: string;
        schemaDefinition: string;
        message: string;
    }
    | {
        kind: 'missing_exports';
        nodeId: string;
        schemaDefinition: string;
        message: string;
    }
    | {
        kind: 'schema_unresolved';
        nodeId: string;
        schemaDefinition: string;
        message: string;
    }
    | {
        kind: 'error';
        nodeId: string;
        schemaDefinition: string;
        message: string;
    };

export interface ResolveSchemaDefinitionsBatchResult {
    results: ResolveSchemaDefinitionResult[];
    message?: string;
}
