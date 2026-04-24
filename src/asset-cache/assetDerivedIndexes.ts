import type { JsonAssetInstance } from "../shared/fieldTypes";
import type {
  AssetDerivedIndexShard,
  AssetDerivedNpcComponentMetadata,
} from "../shared/indexTypes";
import { isObject } from "../shared/typeUtils";

const HYTALE_VERSION = "runtime";

export function buildAssetDerivedIndexes(
  assetInstances: Map<string, Map<string, JsonAssetInstance>>,
): Map<string, AssetDerivedIndexShard> {
  return buildNpcComponentIndexes(assetInstances.get("NPCRole") ?? new Map());
}

function buildNpcComponentIndexes(
  npcRoleAssets: Map<string, JsonAssetInstance>,
): Map<string, AssetDerivedIndexShard> {
  const components: Record<string, AssetDerivedNpcComponentMetadata> = {};
  const interfaces: Record<
    string,
    {
      componentCount: number;
      componentClasses: Set<string>;
      parameterNames: Set<string>;
      importStates: Set<string>;
    }
  > = {};

  for (const asset of npcRoleAssets.values()) {
    const metadata = extractNpcComponentMetadata(asset);
    if (!metadata) {
      continue;
    }

    components[asset.name] = metadata;

    if (!metadata.interface) {
      continue;
    }

    interfaces[metadata.interface] ??= {
      componentCount: 0,
      componentClasses: new Set(),
      parameterNames: new Set(),
      importStates: new Set(),
    };
    const interfaceMetadata = interfaces[metadata.interface];
    interfaceMetadata.componentCount += 1;
    if (metadata.componentClass) {
      interfaceMetadata.componentClasses.add(metadata.componentClass);
    }
    for (const parameterName of metadata.parameterNames ?? []) {
      interfaceMetadata.parameterNames.add(parameterName);
    }
    for (const importState of metadata.importStates ?? []) {
      interfaceMetadata.importStates.add(importState);
    }
  }

  const generatedAt = new Date().toISOString();
  const interfaceValues = Object.fromEntries(
    Object.entries(interfaces).map(([interfaceName, metadata]) => [
      interfaceName,
      {
        componentCount: metadata.componentCount,
        componentClasses: [...metadata.componentClasses].sort(),
        parameterNames: [...metadata.parameterNames].sort(),
        importStates: [...metadata.importStates].sort(),
      },
    ]),
  );
  const parameterValues = Object.fromEntries(
    Object.entries(interfaces).map(([interfaceName, metadata]) => [
      interfaceName,
      [...metadata.parameterNames].sort(),
    ]),
  );

  return new Map<string, AssetDerivedIndexShard>([
    [
      "npcComponents",
      {
        hytaleVersion: HYTALE_VERSION,
        generatedAt,
        indexKind: "assetDerived",
        key: "npcComponents",
        values: components,
      },
    ],
    [
      "npcComponentInterfaces",
      {
        hytaleVersion: HYTALE_VERSION,
        generatedAt,
        indexKind: "assetDerived",
        key: "npcComponentInterfaces",
        values: interfaceValues,
      },
    ],
    [
      "npcInterfaceParameters",
      {
        hytaleVersion: HYTALE_VERSION,
        generatedAt,
        indexKind: "assetDerived",
        key: "npcInterfaceParameters",
        values: parameterValues,
      },
    ],
  ]);
}

function extractNpcComponentMetadata(
  asset: JsonAssetInstance,
): AssetDerivedNpcComponentMetadata | undefined {
  const rawJson = asset.rawJson;
  if (!isObject(rawJson) || rawJson.Type !== "Component") {
    return undefined;
  }

  const parameters = isObject(rawJson.Parameters) ? rawJson.Parameters : undefined;
  const parameterNames = parameters
    ? Object.keys(parameters).filter(parameterName => parameterName !== "_ImportStates")
    : [];
  const importStates = Array.isArray(parameters?._ImportStates)
    ? parameters._ImportStates.filter((value): value is string => typeof value === "string")
    : [];

  return {
    sourcedFromFile: asset.path,
    package: asset.package,
    componentClass: typeof rawJson.Class === "string" ? rawJson.Class : undefined,
    interface: typeof rawJson.Interface === "string" ? rawJson.Interface : undefined,
    parameterNames,
    importStates,
  };
}
