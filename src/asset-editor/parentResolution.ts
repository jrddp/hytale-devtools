import type { JsonAssetInstance } from "../shared/fieldTypes";
import { isObject } from "../shared/typeUtils";

export type ParentAssetLookup = (
  assetType: string,
  assetName: string,
) => JsonAssetInstance | undefined;

export function readParentName(documentJson: unknown): string | undefined {
  if (!isObject(documentJson)) {
    return undefined;
  }

  const parent = documentJson.Parent;
  return typeof parent === "string" && parent.length > 0 ? parent : undefined;
}

export function resolveEffectiveParentData({
  assetType,
  parentName,
  lookupParentAsset,
}: {
  assetType: string;
  parentName: string | undefined;
  lookupParentAsset: ParentAssetLookup;
}): Record<string, unknown> | undefined {
  const parentChain: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  let nextParentName = parentName;

  while (nextParentName && !visited.has(nextParentName)) {
    visited.add(nextParentName);
    const parentAsset = lookupParentAsset(assetType, nextParentName);
    if (!parentAsset) {
      break;
    }

    parentChain.push(parentAsset.rawJson);
    nextParentName = readParentName(parentAsset.rawJson);
  }

  if (parentChain.length === 0) {
    return undefined;
  }

  return Object.assign({}, ...parentChain.reverse());
}

export function resolveEffectiveParentDataByName({
  assetType,
  documentJson,
  lookupParentAsset,
}: {
  assetType: string;
  documentJson: unknown;
  lookupParentAsset: ParentAssetLookup;
}): Record<string, Record<string, unknown>> {
  const parentNames = new Set<string>();
  collectParentNames(documentJson, parentNames);

  const parentDataByName: Record<string, Record<string, unknown>> = {};
  for (const parentName of parentNames) {
    const parentData = resolveEffectiveParentData({
      assetType,
      parentName,
      lookupParentAsset,
    });
    if (parentData) {
      parentDataByName[parentName] = parentData;
    }
  }

  return parentDataByName;
}

function collectParentNames(value: unknown, parentNames: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectParentNames(item, parentNames);
    }
    return;
  }

  if (!isObject(value)) {
    return;
  }

  const parentName = readParentName(value);
  if (parentName) {
    parentNames.add(parentName);
  }

  for (const childValue of Object.values(value)) {
    collectParentNames(childValue, parentNames);
  }
}
