import type { IndexReference } from "../indexTypes";
import type { NpcDescriptorAttribute } from "./descriptorTypes";

const NPC_DESCRIPTOR_ASSET_DOMAIN_TO_REGISTERED_ASSET_KEY: Record<string, string> = {
  AttitudeGroup: "AttitudeGroup",
  BarterShop: "BarterShopAsset",
  BeaconNPCSpawn: "BeaconNPCSpawn",
  BlockSet: "BlockSet",
  EntityEffect: "EntityEffect",
  EntityStat: "EntityStatType",
  FlockAsset: "FlockAsset",
  Interaction: "RootInteraction",
  Item: "Item",
  ItemAttitudeGroup: "ItemAttitudeGroup",
  ItemDropList: "ItemDropList",
  Model: "ModelAsset",
  Objective: "ObjectiveAsset",
  ParticleSystem: "ParticleSystem",
  Role: "NPCRole",
  Shop: "ShopAsset",
  SoundEvent: "SoundEvent",
  SpawnMarker: "SpawnMarker",
  TagSet: "NPCGroup",
  Weather: "Weather",
};

export function resolveNpcDescriptorAssetSymbolLookup(
  descriptorAttribute: Pick<NpcDescriptorAttribute, "Type" | "Domain"> | undefined,
): IndexReference | undefined {
  if (
    !descriptorAttribute ||
    typeof descriptorAttribute.Domain !== "string" ||
    (descriptorAttribute.Type !== "Asset" && descriptorAttribute.Type !== "AssetArray")
  ) {
    return undefined;
  }

  const registeredAssetsKey =
    NPC_DESCRIPTOR_ASSET_DOMAIN_TO_REGISTERED_ASSET_KEY[descriptorAttribute.Domain];
  if (!registeredAssetsKey) {
    return undefined;
  }

  return {
    indexKind: "registeredAssets",
    key: registeredAssetsKey,
  };
}
