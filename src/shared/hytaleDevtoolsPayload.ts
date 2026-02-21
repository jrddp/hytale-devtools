export type HytaleDevtoolsSemanticKind =
    | 'symbolReference'
    | 'symbolDefinition'
    | 'literalChoice'
    | 'inlineOrReference'
    | 'assetPath'
    | 'color';

export type HytaleDevtoolsValueShape = string;

export type HytaleDevtoolsImportForm = 'directImportField' | 'typeImportedName';

export type HytaleDevtoolsLocalizationLocaleStrategy = 'activeThenEnUs' | 'allLocales';

export type HytaleDevtoolsUiDataSetComponent = 'Text' | 'Dropdown';

export type HytaleDevtoolsColorMode = 'color' | 'colorAlpha' | 'colorLight';

export interface HytaleDevtoolsSemanticsBase {
    semanticKind: HytaleDevtoolsSemanticKind;
    valueShape?: HytaleDevtoolsValueShape;
}

export type HytaleDevtoolsSymbolReferenceSource =
    | {
        kind: 'registryDomain';
        domain: string;
    }
    | {
        kind: 'importFamily';
        family: string;
        importForm?: HytaleDevtoolsImportForm;
    }
    | {
        kind: 'referenceBundle';
        bundleType: string;
    }
    | {
        kind: 'localization';
        localeStrategy: HytaleDevtoolsLocalizationLocaleStrategy;
    }
    | {
        kind: 'cosmeticDomain';
        domain: string;
    }
    | {
        kind: 'parentDomain';
        domain: string;
        mapKey?: string;
        mapKeyValue?: string;
        excludeSelf?: boolean;
    }
    | {
        kind: 'uiDataSet';
        dataSet: string;
        component?: HytaleDevtoolsUiDataSetComponent;
    }
    | {
        kind: 'literalSet';
        allowedValues: string[];
    };

export interface HytaleDevtoolsSymbolReferenceSemantics extends HytaleDevtoolsSemanticsBase {
    semanticKind: 'symbolReference';
    target: 'value' | 'objectKey';
    source: HytaleDevtoolsSymbolReferenceSource;
    excludeExistingObjectKeys?: boolean;
}

export type HytaleDevtoolsSymbolNamespace =
    | {
        kind: 'importFamily';
        family: string;
    }
    | {
        kind: 'referenceBundle';
        bundleType: string;
    };

export interface HytaleDevtoolsSymbolDefinitionSemantics extends HytaleDevtoolsSemanticsBase {
    semanticKind: 'symbolDefinition';
    namespace: HytaleDevtoolsSymbolNamespace;
    valueField?: string;
}

export interface HytaleDevtoolsLiteralChoiceSemantics extends HytaleDevtoolsSemanticsBase {
    semanticKind: 'literalChoice';
    values?: string[];
    acceptedValues?: string[];
    normalizeToCanonical?: boolean;
    role?: 'enum' | 'discriminator';
    defaultValue?: string;
    parentPropertyKey?: string;
}

export interface HytaleDevtoolsInlineOrReferenceSemantics extends HytaleDevtoolsSemanticsBase {
    semanticKind: 'inlineOrReference';
    referenceSource: {
        kind: 'registryDomain';
        domain: string;
    };
    acceptsInlineValue: boolean;
    acceptsAssetKey: boolean;
    inlineSchemaRef?: string;
}

export interface HytaleDevtoolsAssetPathSemantics extends HytaleDevtoolsSemanticsBase {
    semanticKind: 'assetPath';
    requiredRoots?: string[];
    requiredExtension?: string;
    isUIAsset?: boolean;
}

export interface HytaleDevtoolsColorSemantics extends HytaleDevtoolsSemanticsBase {
    semanticKind: 'color';
    colorMode: HytaleDevtoolsColorMode;
    supportsAlpha: boolean;
}

export type HytaleDevtoolsPayload =
    | HytaleDevtoolsSymbolReferenceSemantics
    | HytaleDevtoolsSymbolDefinitionSemantics
    | HytaleDevtoolsLiteralChoiceSemantics
    | HytaleDevtoolsInlineOrReferenceSemantics
    | HytaleDevtoolsAssetPathSemantics
    | HytaleDevtoolsColorSemantics;

const KNOWN_SEMANTIC_KINDS = new Set<HytaleDevtoolsSemanticKind>([
    'symbolReference',
    'symbolDefinition',
    'literalChoice',
    'inlineOrReference',
    'assetPath',
    'color'
]);

export function isHytaleDevtoolsPayload(value: unknown): value is HytaleDevtoolsPayload {
    return isRecord(value) && isHytaleDevtoolsSemanticKind(value.semanticKind);
}

export function asHytaleDevtoolsPayload(value: unknown): HytaleDevtoolsPayload | undefined {
    return isHytaleDevtoolsPayload(value) ? value : undefined;
}

function isHytaleDevtoolsSemanticKind(value: unknown): value is HytaleDevtoolsSemanticKind {
    return typeof value === 'string' && KNOWN_SEMANTIC_KINDS.has(value as HytaleDevtoolsSemanticKind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
