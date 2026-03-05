export type SchemaMappings = {
  hytaleVersion: string;
  generatedAt: string;
  schemaMappings: {
    "json.schemas": {
      fileMatch: string[];
      url: string;
    }[];
    "files.associations": {
      [key: string]: string;
    };
    "editor.tabSize": number;
  };
};

export type HytaleDevtoolsMetadata = {
  valueShape:
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | "stringOrObject"
    // they key of a json object (not the object itself)
    | "objectKey";
} & SemanticReference;

export type SemanticReference =
  | {
      semanticKind: "symbolReference";
      target: "value" | "objectKey";
      source: {
        type: Exclude<IndexKind, "commonAssetsByRoot">;
        key: string;
      };
    }
  | {
      semanticKind: "symbolDefinition";
      source: {
        type: string;
        key: string;
      };
    }
  | {
      semanticKind: "literalChoice";
      values: string[];
      acceptedValues?: string[];
      defaultValue?: string;
    }
  | {
      semanticKind: "inlineOrReference";
      source: {
        type: "registeredAssets";
        key: string;
      };
      inlineSchemaRef?: string;
    }
  | {
      semanticKind: "assetPath";
      // allowed paths to get from
      requiredRoots: string[];
      requiredExtension?: string;
      isUIAsset?: boolean;
    }
  | {
      semanticKind: "color";
      colorMode: "color" | "colorAlpha" | "colorLight";
      supportsAlpha: boolean;
    };

export type SymbolIndexShardBase = {
  hytaleVersion: string;
  generatedAt: string;
  indexKind: IndexKind;
  key: string;
};

// list of all registered assets for each asset type
export type RegisteredAssetIndexShard = SymbolIndexShardBase & {
  indexKind: "registryDomain";
  // asset type root path in pack-relative form (for example Server/Item)
  path: string;
  // file extension used by this asset type (for example .json)
  extension: string;
  // number of entries in values
  assetCount: number;
  // number of entries with sourcedFromFile set
  fileCount: number;
  // asset name -> where it was sourced from
  values: Record<
    string,
    {
      sourcedFromFile?: string;
    }
  >;
};

// paths to common assets
export type AssetPathIndexShard = SymbolIndexShardBase & {
  indexKind: "commonAssetsByRoot";
  // (assettype.json) -> path -> file type -> direct descendents of that path with that file type (filename)
  // child paths store descendents separately, when retrieving match all child paths
  values: Record<
    string,
    {
      [key: string]: string[];
    }
  >;
};

// "ExportAs" adds values to a family that can be used via "ImportAs"
// (family.json) -> export names
export type ExportFamilyIndexShard = SymbolIndexShardBase & {
  indexKind: "exportsByFamily";
  // key: export name -> where it came from
  values: Record<
    string,
    {
      sourcedFromFile: string;
    }
  >;
};

// (language.json) -> localization keys -> translation value
export type LocalizationIndexShard = SymbolIndexShardBase & {
  indexKind: "localizationKeys";
  values: Record<string, string>;
};

// custom reference values defined by WorldStructures
// valid values depend on world structures defining, but we aggregate all values without more advanced logic
// right now these are literally only used for "DecimalConstants" -> "Base"/"Bedrock"/"Water" though, which refer to preset y levels in worldgen
// (bundle.json) -> values[]
export type ReferenceBundleIndexShard = SymbolIndexShardBase & {
  indexKind: "referenceBundle";
  values: string[];
};

// values defined statically in schema for asset editor dropdown/enum UIs
// (dataset.json) -> values[]
export type UIDataSetIndexShard = SymbolIndexShardBase & {
  indexKind: "uiDataSets";
  values: string[];
};

export type SymbolIndexShard =
  | RegisteredAssetIndexShard
  | AssetPathIndexShard
  | ExportFamilyIndexShard
  | LocalizationIndexShard
  | ReferenceBundleIndexShard
  | UIDataSetIndexShard;

export type IndexKind =
  | "registryDomain"
  | "commonAssetsByRoot"
  | "exportsByFamily"
  | "localizationKeys"
  | "referenceBundle"
  | "uiDataSets";

// key -> index shard
export type SymbolIndex = {
  [key: string]: SymbolIndexShard;
};
