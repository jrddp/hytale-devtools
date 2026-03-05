import { existsSync, readdirSync } from "fs";
import path from "path";
import type * as vscode from "vscode";
import { indexes, LOGGER } from "../extension";
import { safeParseJSONFile } from "../shared/fileUtils";
import {
  type AssetPathIndexShard,
  type ExportFamilyIndexShard,
  type IndexKind,
  type ReferenceBundleIndexShard,
  type RegisteredAssetIndexShard,
  type SemanticReference,
  type SymbolIndex,
  type SymbolIndexShard,
  type UIDataSetIndexShard,
} from "../shared/schema/types";
import { resolveSchemaDataLocation } from "../utils/hytalePaths";

// directory name -> indexKind
const indexRoots: Record<string, IndexKind> = {
  assetPaths: "commonAssetsByRoot",
  registeredAssets: "registryDomain",
  exportFamilies: "exportsByFamily",
  localization: "localizationKeys",
  referenceBundle: "referenceBundle",
  uiDataSets: "uiDataSets",
};

export function loadIndexes(context: vscode.ExtensionContext): Map<IndexKind, SymbolIndex> {
  return loadIndexesFromRoot(resolveSchemaDataLocation(context).rootPath);
}

export function loadIndexesFromRoot(exportRoot: string): Map<IndexKind, SymbolIndex> {
  const indexes = new Map<IndexKind, SymbolIndex>();

  for (const [directoryName, indexKind] of Object.entries(indexRoots)) {
    if (!existsSync(path.join(exportRoot, "indexes", directoryName))) {
      continue;
    }
    indexes.set(indexKind, {});
    for (const file of readdirSync(path.join(exportRoot, "indexes", directoryName))) {
      const indexShard = safeParseJSONFile(
        path.join(exportRoot, "indexes", directoryName, file),
      ) as SymbolIndexShard;
      indexes.get(indexKind)![indexShard.key] = indexShard;
    }
  }

  LOGGER.info(Array.from(indexes.keys()).toString());
  return indexes;
}

export function getValuesBySemanticReference(reference: SemanticReference): string[] {
  switch (reference.semanticKind) {
    case "symbolReference":
      return getValuesBySymbolReference(reference.source.type, reference.source.key);
    case "literalChoice":
      return reference.values;
    case "inlineOrReference":
      return getValuesBySymbolReference("registryDomain", reference.source.key);
    case "assetPath":
      return getValuesByAssetPath(
        reference.requiredRoots,
        reference.requiredExtension,
        reference.isUIAsset,
      );
  }
  return [];
}

function getValuesBySymbolReference(type: IndexKind, key: string): string[] {
  const index = indexes.get(type);
  if (!index) {
    return [];
  }
  if (!index[key]) {
    return [];
  }
  switch (type) {
    case "registryDomain":
      const assetShard = index[key] as RegisteredAssetIndexShard;
      return Object.keys(assetShard.values);
    case "exportsByFamily":
      const exportShard = index[key] as ExportFamilyIndexShard;
      return Object.keys(exportShard.values);
    case "referenceBundle":
      const referenceShard = index[key] as ReferenceBundleIndexShard;
      return referenceShard.values;
    case "uiDataSets":
      const uiDataSetShard = index[key] as UIDataSetIndexShard;
      return uiDataSetShard.values;
    default:
      return [];
  }
}

function getValuesByAssetPath(
  requiredRoots: string[] = [],
  requiredExtension: string = "",
  isUIAsset?: boolean,
): string[] {
  const index = indexes.get("commonAssetsByRoot");
  if (!index) {
    return [];
  }
  if (!index["all"]) {
    return [];
  }
  const shard = index["all"] as AssetPathIndexShard;
  if (!shard) {
    return [];
  }
  return Object.entries(shard.values).reduce<string[]>((acc, [dirPath, groupByFileType]) => {
    if (requiredRoots.length > 0 && !requiredRoots.some(root => dirPath.startsWith(root))) {
      return acc;
    }
    if (requiredExtension) {
      return [...acc, ...groupByFileType[requiredExtension]];
    }
    return [...acc, ...Object.values(groupByFileType).flat()];
  }, []);
}
