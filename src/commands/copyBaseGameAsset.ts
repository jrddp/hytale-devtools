import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { assetCacheRuntime, indexes, LOGGER } from "../extension";
import {
  NPC_COMPONENT_CLASSES,
  type NpcComponentClass,
  type NpcRoleType,
} from "../shared/npc-role-editor/documentTypes";
import {
  parseNpcComponentClassFromText,
  parseNpcRoleTypeFromText,
} from "../npc-role-editor/npcReferenceResolver";
import { type RegisteredAssetsIndexShard, type SymbolIndex } from "../shared/indexTypes";

interface AssetTypeQuickPickItem extends vscode.QuickPickItem {
  assetShard?: RegisteredAssetsIndexShard;
  assetTypeName?: string;
  baseGameFileCount: number;
  npcRoleType?: NpcRoleType;
}

interface AssetQuickPickItem extends vscode.QuickPickItem {
  assetTypePath: string;
  assetTypeName: string;
  assetPath?: string;
  fileExtension: string;
  isCreateEmpty?: boolean;
  npcRoleType?: NpcRoleType;
  npcComponentClass?: NpcComponentClass;
}

type NpcRoleAssetInfo = {
  value: string;
  sourcedFromFile: string;
  package?: string;
  roleType: NpcRoleType;
  componentClass?: string;
};

const NPC_ROLE_TYPE_MENU_ORDER: NpcRoleType[] = ["Generic", "Abstract", "Component", "Variant"];

export async function copyBaseGameAsset(context: vscode.ExtensionContext): Promise<void> {
  const { registeredAssets, npcRoleAssetInfos } = await loadCopyBaseGameAssetMenuData();

  const items = buildAssetTypeQuickPickItems(registeredAssets, npcRoleAssetInfos);
  const fullAssetCount = Array.from(registeredAssets.values()).reduce(
    (acc, shard) => acc + (shard as RegisteredAssetsIndexShard).baseGameFileCount,
    0,
  );
  const searchAllItem: AssetTypeQuickPickItem = {
    label: "Search all assets",
    detail: `${fullAssetCount} assets`,
    baseGameFileCount: fullAssetCount,
  };
  items.unshift(searchAllItem);
  const selectedAssetType = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an asset type",
  });
  if (!selectedAssetType) {
    return;
  }
  const asset = await showAssetQuickPick(selectedAssetType, npcRoleAssetInfos);
  if (!asset) {
    return;
  }
  const choseEmpty = asset.isCreateEmpty === true;
  let componentClass = asset.npcComponentClass;
  if (choseEmpty && asset.npcRoleType === "Component") {
    componentClass = await showNpcComponentClassQuickPick();
    if (!componentClass) {
      return;
    }
  }

  let defaultName =
    asset.assetPath ??
    path.join(asset.assetTypePath, getDefaultEmptyAssetFileName(asset, componentClass));
  let nameChoice = await vscode.window.showInputBox({
    placeHolder: defaultName,
    prompt: choseEmpty
      ? "Enter name for your new asset"
      : `Enter name for your new ${asset.assetTypeName} (leave blank to override original)`,
  });

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder found");
  }

  let destinationPath = defaultName;

  if (nameChoice) {
    if (!nameChoice.endsWith(asset.fileExtension)) {
      nameChoice += asset.fileExtension;
    }
    destinationPath = path.join(asset.assetTypePath, path.normalize(nameChoice));
  }

  destinationPath = path.join(
    workspaceFolder.uri.fsPath,
    "src",
    "main",
    "resources",
    destinationPath,
  );

  LOGGER.info(`Destination path: ${destinationPath}`);

  if (!choseEmpty) {
    copyAsset(asset.assetPath!, destinationPath)
      .then(() => {
        LOGGER.info(`Copied asset to ${destinationPath}`);
        // open asset in editor
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(destinationPath));
      })
      .catch(error => {
        LOGGER.error(`Failed to copy asset: ${error.message}`);
      });
  } else {
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.promises.writeFile(destinationPath, getEmptyAssetContent(asset, componentClass));
    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(destinationPath));
  }
}

async function loadCopyBaseGameAssetMenuData(): Promise<{
  registeredAssets: SymbolIndex;
  npcRoleAssetInfos: NpcRoleAssetInfo[];
}> {
  const loadMenuData = async () => {
    await assetCacheRuntime.ready;

    const registeredAssets = indexes.get("registeredAssets");
    if (!registeredAssets) {
      throw new Error("Registered asset index is not available.");
    }

    const npcRoleShard = registeredAssets.get("NPCRole") as RegisteredAssetsIndexShard | undefined;
    const npcRoleAssetInfos = await loadNpcRoleAssetInfos(npcRoleShard);
    return {
      registeredAssets,
      npcRoleAssetInfos,
    };
  };

  if (assetCacheRuntime.isReady) {
    return await loadMenuData();
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Hytale Devtools: Loading assets...",
      cancellable: false,
    },
    async progress => {
      progress.report({ message: "Preparing asset list" });
      return await loadMenuData();
    },
  );
}

function buildAssetTypeQuickPickItems(
  registeredAssets: SymbolIndex,
  npcRoleAssetInfos: NpcRoleAssetInfo[],
): AssetTypeQuickPickItem[] {
  const items = Array.from(registeredAssets.entries())
    .map(([storeName, shard]) => {
      const assetShard = shard as RegisteredAssetsIndexShard;
      if (storeName === "NPCRole") {
        return NPC_ROLE_TYPE_MENU_ORDER.map(roleType => {
          const count = npcRoleAssetInfos.filter(info => info.roleType === roleType).length;
          return {
            label: formatNpcRoleAssetTypeLabel(roleType),
            detail: `${assetShard.path}/*${assetShard.extension} | ${count} assets`,
            assetShard,
            assetTypeName: formatNpcRoleAssetTypeLabel(roleType),
            baseGameFileCount: count,
            npcRoleType: roleType,
          };
        });
      }

      return [
        {
          label: storeName,
          detail: `${assetShard.path}/*${assetShard.extension} | ${assetShard.baseGameFileCount} assets`,
          assetShard,
          assetTypeName: assetShard.key,
          baseGameFileCount: assetShard.baseGameFileCount,
        },
      ];
    })
    .flat()
    .sort((a, b) => b.baseGameFileCount - a.baseGameFileCount || a.label.localeCompare(b.label));

  return items;
}

async function showAssetQuickPick(
  selectedAssetType: AssetTypeQuickPickItem,
  npcRoleAssetInfos: NpcRoleAssetInfo[],
): Promise<AssetQuickPickItem | undefined> {
  let items: AssetQuickPickItem[] = [];
  // all assets
  if (!selectedAssetType.assetShard) {
    items = items.concat(
      Array.from(indexes.get("registeredAssets")!.entries())
        .map(([storeName, shard]) => {
          const assetShard = shard as RegisteredAssetsIndexShard;
          return Object.entries(assetShard.values)
            .filter(
              ([value, metadata]) =>
                Boolean(metadata.sourcedFromFile) && metadata.package === "Hytale:Hytale",
            )
            .map(([value, metadata]) => ({
              label: value,
              detail: metadata.sourcedFromFile,
              assetTypePath: assetShard.path,
              assetTypeName: assetShard.key,
              assetPath: metadata.sourcedFromFile!,
              fileExtension: assetShard.extension,
            }));
        })
        .flat(),
    );
  } else {
    const assetShard = selectedAssetType.assetShard;
    items.push(createEmptyAssetQuickPickItem(selectedAssetType));
    if (selectedAssetType.npcRoleType) {
      items = items.concat(
        npcRoleAssetInfos
          .filter(info => info.roleType === selectedAssetType.npcRoleType)
          .map(info => ({
            label: info.value,
            detail: info.sourcedFromFile,
            assetTypePath: assetShard.path,
            assetPath: info.sourcedFromFile,
            assetTypeName: selectedAssetType.assetTypeName ?? assetShard.key,
            fileExtension: assetShard.extension,
            npcRoleType: info.roleType,
            npcComponentClass: info.componentClass as NpcComponentClass | undefined,
          })),
      );
    } else {
      items = items.concat(
        Object.entries(assetShard.values)
          .filter(
            ([value, metadata]) =>
              Boolean(metadata.sourcedFromFile) && metadata.package === "Hytale:Hytale",
          )
          .map(([value, metadata]) => ({
            label: value,
            detail: metadata.sourcedFromFile,
            assetTypePath: assetShard.path,
            assetPath: metadata.sourcedFromFile!,
            assetTypeName: selectedAssetType.assetTypeName ?? assetShard.key,
            fileExtension: assetShard.extension,
          })),
      );
    }
  }
  return vscode.window.showQuickPick(items, {
    placeHolder: "Select an asset to copy",
  });
}

function createEmptyAssetQuickPickItem(selectedAssetType: AssetTypeQuickPickItem): AssetQuickPickItem {
  const assetShard = selectedAssetType.assetShard!;
  return {
    label: "Create empty asset",
    alwaysShow: true,
    assetTypePath: assetShard.path,
    assetTypeName: selectedAssetType.assetTypeName ?? assetShard.key,
    fileExtension: assetShard.extension,
    isCreateEmpty: true,
    npcRoleType: selectedAssetType.npcRoleType,
  };
}

async function showNpcComponentClassQuickPick(): Promise<NpcComponentClass | undefined> {
  const selected = await vscode.window.showQuickPick(
    NPC_COMPONENT_CLASSES.map(componentClass => ({
      label: componentClass,
      componentClass,
    })),
    {
      placeHolder: "Select an NPC component class",
    },
  );
  return selected?.componentClass;
}

async function loadNpcRoleAssetInfos(
  assetShard: RegisteredAssetsIndexShard | undefined,
): Promise<NpcRoleAssetInfo[]> {
  if (!assetShard) {
    return [];
  }

  const entries = Object.entries(assetShard.values).filter(
    ([value, metadata]) => Boolean(metadata.sourcedFromFile) && metadata.package === "Hytale:Hytale",
  );

  const infos = await Promise.all(
    entries.map(async ([value, metadata]): Promise<NpcRoleAssetInfo | undefined> => {
      try {
        const bytes = await assetCacheRuntime.readAssetBytesByPath(metadata.sourcedFromFile!);
        if (!bytes) {
          return undefined;
        }

        const text = bytes.toString("utf8");
        const roleType = parseNpcRoleTypeFromText(text);
        if (!roleType) {
          return undefined;
        }

        const info: NpcRoleAssetInfo = {
          value,
          sourcedFromFile: metadata.sourcedFromFile!,
          package: metadata.package,
          roleType: roleType as NpcRoleType,
          componentClass: parseNpcComponentClassFromText(text),
        };
        return info;
      } catch {
        return undefined;
      }
    }),
  );

  return infos.filter((info): info is NpcRoleAssetInfo => Boolean(info));
}

function formatNpcRoleAssetTypeLabel(roleType: NpcRoleType): string {
  return `NPCRole - ${roleType}`;
}

function getDefaultEmptyAssetFileName(
  asset: AssetQuickPickItem,
  componentClass: NpcComponentClass | undefined,
): string {
  if (asset.npcRoleType === "Component") {
    return `New${componentClass ?? "Component"}Component${asset.fileExtension}`;
  }

  if (asset.npcRoleType) {
    return `New${asset.npcRoleType}Role${asset.fileExtension}`;
  }

  return `NewAsset${asset.fileExtension}`;
}

function getEmptyAssetContent(
  asset: AssetQuickPickItem,
  componentClass: NpcComponentClass | undefined,
): string {
  if (asset.fileExtension.toLowerCase() !== ".json") {
    return "";
  }

  if (asset.npcRoleType === "Component") {
    return `${JSON.stringify({ Type: "Component", Class: componentClass }, null, 2)}\n`;
  }

  if (asset.npcRoleType) {
    return `${JSON.stringify({ Type: asset.npcRoleType }, null, 2)}\n`;
  }

  return "{\n\n}";
}

async function copyAsset(
  assetPath: string,
  destinationPath: string,
): Promise<void> {
  const didCopy = await assetCacheRuntime.copyAssetByPath(assetPath, destinationPath);
  if (!didCopy) {
    throw new Error(`Asset not found in indexed Assets.zip: ${assetPath}`);
  }
}
