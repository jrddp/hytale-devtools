import { existsSync, readdirSync } from "fs";
import path from "path";
import type * as vscode from "vscode";
import { indexes, LOGGER } from "../extension";
import { safeParseJSONFile } from "../shared/fileUtils";
import {
  type CommonAssetPathsIndexShard,
  type ExportFamilyIndexShard,
  type IndexKind,
  type IndexReference,
  type IndexShard,
  type ReferenceBundleIndexShard,
  type RegisteredAssetsIndexShard,
  type SymbolIndex,
  type UIDataSetIndexShard,
} from "../shared/indexTypes";
import { normalizePosixPath } from "../shared/pathUtils";
import { INDEXES_DIRECTORY_NAME, resolveDataRootDirFromContext } from "../utils/hytalePaths";

export function loadIndexes(context: vscode.ExtensionContext): Map<IndexKind, SymbolIndex> {
  return loadIndexesFromRoot(resolveDataRootDirFromContext(context).rootPath);
}

export function loadIndexesFromRoot(dataRoot: string): Map<IndexKind, SymbolIndex> {
  const indexes = new Map<IndexKind, SymbolIndex>();
  const indexRoot = path.join(dataRoot, INDEXES_DIRECTORY_NAME);

  for (const directoryName of readdirSync(indexRoot)) {
    const indexKind = directoryName as IndexKind;
    if (!existsSync(path.join(indexRoot, directoryName))) {
      continue;
    }
    indexes.set(indexKind, new Map<string, IndexShard>());
    for (const file of readdirSync(path.join(indexRoot, directoryName))) {
      const indexShard = safeParseJSONFile(path.join(indexRoot, directoryName, file)) as IndexShard;
      if (indexShard.indexKind === "registeredAssets") {
        const registeredAssetsShard = indexShard as RegisteredAssetsIndexShard;
        registeredAssetsShard.baseGameFileCount = Object.values(
          registeredAssetsShard.values,
        ).filter(value => value.sourcedFromFile && value.package === "Hytale:Hytale").length;
      }
      indexes.get(indexKind)!.set(indexShard.key, indexShard);
    }
  }
  return indexes;
}

export function getValuesByIndexReference(reference: IndexReference): string[] {
  const index = indexes.get(reference.indexKind);
  if (!index) {
    LOGGER.error(`Index for ${reference.indexKind} not found`);
    return [];
  }
  let shard = index.get(reference.key);
  if (!shard) {
    LOGGER.error(`Index shard for ${reference.indexKind} ${reference.key} not found`);
    return [];
  }

  switch (reference.indexKind) {
    case "exportFamily":
      shard = shard as ExportFamilyIndexShard;
      return Object.keys(shard.values);
    case "referenceBundle":
      shard = shard as ReferenceBundleIndexShard;
      return shard.values;
    case "uiDataSet":
      shard = shard as UIDataSetIndexShard;
      // TODO special cases
      return [];
    case "registeredAssets":
      shard = shard as RegisteredAssetsIndexShard;
      return Object.keys(shard.values);
    case "commonAssetPaths":
      shard = shard as CommonAssetPathsIndexShard;
      return getCommonAssetPathValues(shard, reference);
  }
  return [];
}

export function getCommonAssetPathValues(
  shard: CommonAssetPathsIndexShard,
  reference: Extract<IndexReference, { indexKind: "commonAssetPaths" }>,
): string[] {
  const requestedFolders = reference.folders
    .map(normalizeCommonAssetFolder)
    .filter((folder): folder is string => folder.length > 0);
  const values: string[] = [];

  for (const [directParentFolder, filesByFileType] of Object.entries(shard.values)) {
    const normalizedParentFolder = normalizeCommonAssetFolder(directParentFolder);
    if (!requestedFolders.some(folder => folderMatches(folder, normalizedParentFolder))) {
      continue;
    }

    const fileNames = reference.extension
      ? (filesByFileType[reference.extension] ?? [])
      : Object.values(filesByFileType).flat();

    values.push(
      ...fileNames.map(fileName => path.posix.join(normalizedParentFolder, fileName)),
    );
  }

  return values;
}

function normalizeCommonAssetFolder(folder: string): string {
  let normalizedFolder = normalizePosixPath(folder);
  if (normalizedFolder.startsWith("Common/")) {
    normalizedFolder = normalizedFolder.slice("Common/".length);
  }

  return normalizedFolder.replace(/^\/+/, "").replace(/\/+$/, "");
}

function folderMatches(requestedFolder: string, directParentFolder: string): boolean {
  return (
    directParentFolder === requestedFolder || directParentFolder.startsWith(`${requestedFolder}/`)
  );
}
