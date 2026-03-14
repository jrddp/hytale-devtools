export type IndexKind =
  | "commonAssetPaths"
  | "registeredAssets"
  | "uiDataSet"
  | "exportFamily"
  | "referenceBundle";

export type IndexReference =
  | {
      indexKind: Exclude<IndexKind, "commonAssetPaths">;
      key: string;
    }
  | {
      indexKind: "commonAssetPaths";
      key: "all";
      folders: string[];
      extension?: string;
    };

type IndexShardBase = {
  hytaleVersion: string;
  generatedAt: string;
  indexKind: IndexKind;
  key: string;
  values: unknown;
};

export type CommonAssetPathsIndexShard = IndexShardBase & {
  indexKind: "commonAssetPaths";
  key: "all";
  /** folder path -> filetype -> direct file descendents of that path with that file type (as filename with extension)
   * requests should include all subfolders as well, so multiple top-level keys should be aggregated.
   */
  values: Record<string, Record<string, string[]>>;
};

export type RegisteredAssetsIndexShard = IndexShardBase & {
  indexKind: "registeredAssets";
  key: string;
  path: string;
  extension: string;
  assetCount: number;
  fileCount: number;
  baseGameFileCount: number;
  values: Record<
    string,
    {
      sourcedFromFile?: string;
      package?: string;
    }
  >;
};

export type ExportFamilyIndexShard = IndexShardBase & {
  indexKind: "exportFamily";
  key: string;
  values: Record<
    string,
    {
      sourcedFromFile: string;
      package: string;
    }
  >;
};

export type ReferenceBundleIndexShard = IndexShardBase & {
  indexKind: "referenceBundle";
  key: string;
  values: string[];
};

export type UIDataSetIndexShard = IndexShardBase &
  (
    | {
        indexKind: "uiDataSet";
        key: string;
        values: Record<string, string[]>;
      }
    | {
        indexKind: "uiDataSet";
        key: "GradientSets";
        /** gradient set id -> gradient id */
        values: Record<
          string,
          Record<
            string,
            {
              BaseColor: string[];
              Texture: string;
            }
          >
        >;
      }
  );

export type IndexShard =
  | CommonAssetPathsIndexShard
  | RegisteredAssetsIndexShard
  | ExportFamilyIndexShard
  | ReferenceBundleIndexShard
  | UIDataSetIndexShard;

export type SymbolIndex = Map<string, IndexShard>;
