import type { JsonAssetInstance } from "../shared/fieldTypes";
import type {
  AssetDerivedIndexShard,
  AssetDerivedNpcComponentMetadata,
} from "../shared/indexTypes";
import { isObject } from "../shared/typeUtils";

const HYTALE_VERSION = "runtime";

type CountedSet = Map<string, number>;

type NpcComponentContribution = {
  resourceSubpath: string;
  componentName: string;
  metadata: AssetDerivedNpcComponentMetadata;
};

type NpcInterfaceAggregate = {
  componentCount: number;
  componentClasses: CountedSet;
  parameterNames: CountedSet;
  importStates: CountedSet;
};

export class AssetDerivedIndexRuntime {
  readonly derivedIndexes = new Map<string, AssetDerivedIndexShard>();

  private readonly npcComponentContributionsByResource = new Map<string, NpcComponentContribution>();
  private readonly npcComponentValues: Record<string, AssetDerivedNpcComponentMetadata> = {};
  private readonly npcInterfaceAggregates = new Map<string, NpcInterfaceAggregate>();

  constructor() {
    this.refreshNpcComponentShards();
  }

  rebuild(assetInstances: Map<string, Map<string, JsonAssetInstance>>): void {
    this.npcComponentContributionsByResource.clear();
    for (const key of Object.keys(this.npcComponentValues)) {
      delete this.npcComponentValues[key];
    }
    this.npcInterfaceAggregates.clear();

    for (const asset of assetInstances.get("NPCRole")?.values() ?? []) {
      this.addNpcComponentContribution(asset.path, asset);
    }

    this.refreshNpcComponentShards();
  }

  updateForAsset(resourceSubpath: string, asset: JsonAssetInstance | undefined): Set<string> {
    const changedShardKeys = new Set<string>();
    const didRemove = this.removeNpcComponentContribution(resourceSubpath);
    const didAdd = asset ? this.addNpcComponentContribution(resourceSubpath, asset) : false;

    if (didRemove || didAdd) {
      this.refreshNpcComponentShards();
      changedShardKeys.add("npcComponents");
      changedShardKeys.add("npcComponentInterfaces");
      changedShardKeys.add("npcInterfaceParameters");
    }

    return changedShardKeys;
  }

  private addNpcComponentContribution(resourceSubpath: string, asset: JsonAssetInstance): boolean {
    const metadata = extractNpcComponentMetadata(asset);
    if (!metadata) {
      return false;
    }

    const contribution: NpcComponentContribution = {
      resourceSubpath,
      componentName: asset.name,
      metadata,
    };

    this.npcComponentContributionsByResource.set(resourceSubpath, contribution);
    this.npcComponentValues[contribution.componentName] = metadata;

    if (metadata.interface) {
      const aggregate = getOrCreateNpcInterfaceAggregate(
        this.npcInterfaceAggregates,
        metadata.interface,
      );
      aggregate.componentCount += 1;
      incrementCountedSetValue(aggregate.componentClasses, metadata.componentClass);
      for (const parameterName of metadata.parameterNames ?? []) {
        incrementCountedSetValue(aggregate.parameterNames, parameterName);
      }
      for (const importState of metadata.importStates ?? []) {
        incrementCountedSetValue(aggregate.importStates, importState);
      }
    }

    return true;
  }

  private removeNpcComponentContribution(resourceSubpath: string): boolean {
    const contribution = this.npcComponentContributionsByResource.get(resourceSubpath);
    if (!contribution) {
      return false;
    }

    this.npcComponentContributionsByResource.delete(resourceSubpath);
    const currentValue = this.npcComponentValues[contribution.componentName];
    if (currentValue?.sourcedFromFile === resourceSubpath) {
      delete this.npcComponentValues[contribution.componentName];
    }

    const interfaceName = contribution.metadata.interface;
    if (interfaceName) {
      const aggregate = this.npcInterfaceAggregates.get(interfaceName);
      if (aggregate) {
        aggregate.componentCount = Math.max(0, aggregate.componentCount - 1);
        decrementCountedSetValue(aggregate.componentClasses, contribution.metadata.componentClass);
        for (const parameterName of contribution.metadata.parameterNames ?? []) {
          decrementCountedSetValue(aggregate.parameterNames, parameterName);
        }
        for (const importState of contribution.metadata.importStates ?? []) {
          decrementCountedSetValue(aggregate.importStates, importState);
        }
        if (
          aggregate.componentCount === 0 &&
          aggregate.componentClasses.size === 0 &&
          aggregate.parameterNames.size === 0 &&
          aggregate.importStates.size === 0
        ) {
          this.npcInterfaceAggregates.delete(interfaceName);
        }
      }
    }

    return true;
  }

  private refreshNpcComponentShards(): void {
    const generatedAt = new Date().toISOString();
    const interfaceValues = Object.fromEntries(
      [...this.npcInterfaceAggregates.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([interfaceName, metadata]) => [
          interfaceName,
          {
            componentCount: metadata.componentCount,
            componentClasses: sortedCountedSetValues(metadata.componentClasses),
            parameterNames: sortedCountedSetValues(metadata.parameterNames),
            importStates: sortedCountedSetValues(metadata.importStates),
          },
        ]),
    );
    const parameterValues = Object.fromEntries(
      [...this.npcInterfaceAggregates.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([interfaceName, metadata]) => [
          interfaceName,
          sortedCountedSetValues(metadata.parameterNames),
        ]),
    );

    this.derivedIndexes.set("npcComponents", {
      hytaleVersion: HYTALE_VERSION,
      generatedAt,
      indexKind: "assetDerived",
      key: "npcComponents",
      values: { ...this.npcComponentValues },
    });
    this.derivedIndexes.set("npcComponentInterfaces", {
      hytaleVersion: HYTALE_VERSION,
      generatedAt,
      indexKind: "assetDerived",
      key: "npcComponentInterfaces",
      values: interfaceValues,
    });
    this.derivedIndexes.set("npcInterfaceParameters", {
      hytaleVersion: HYTALE_VERSION,
      generatedAt,
      indexKind: "assetDerived",
      key: "npcInterfaceParameters",
      values: parameterValues,
    });
  }
}

export function buildAssetDerivedIndexes(
  assetInstances: Map<string, Map<string, JsonAssetInstance>>,
): Map<string, AssetDerivedIndexShard> {
  const runtime = new AssetDerivedIndexRuntime();
  runtime.rebuild(assetInstances);
  return runtime.derivedIndexes;
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

function getOrCreateNpcInterfaceAggregate(
  aggregates: Map<string, NpcInterfaceAggregate>,
  interfaceName: string,
): NpcInterfaceAggregate {
  let aggregate = aggregates.get(interfaceName);
  if (!aggregate) {
    aggregate = {
      componentCount: 0,
      componentClasses: new Map(),
      parameterNames: new Map(),
      importStates: new Map(),
    };
    aggregates.set(interfaceName, aggregate);
  }
  return aggregate;
}

function incrementCountedSetValue(counts: CountedSet, value: string | undefined): void {
  if (!value) {
    return;
  }
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function decrementCountedSetValue(counts: CountedSet, value: string | undefined): void {
  if (!value) {
    return;
  }
  const nextCount = (counts.get(value) ?? 0) - 1;
  if (nextCount > 0) {
    counts.set(value, nextCount);
  } else {
    counts.delete(value);
  }
}

function sortedCountedSetValues(counts: CountedSet): string[] {
  return [...counts.keys()].sort((left, right) => left.localeCompare(right));
}
