import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as yauzl from "yauzl";
import { indexes, LOGGER } from "../extension";
import { type RegisteredAssetsIndexShard } from "../shared/indexTypes";
import { getAssetsZipPath, resolvePatchlineForContext } from "../utils/hytalePaths";

interface AssetTypeQuickPickItem extends vscode.QuickPickItem {
  assetShard?: RegisteredAssetsIndexShard;
}

interface AssetQuickPickItem extends vscode.QuickPickItem {
  assetTypePath: string;
  assetTypeName: string;
  assetPath?: string;
  fileExtension: string;
}

export async function copyBaseGameAsset(context: vscode.ExtensionContext): Promise<void> {
  const items: AssetTypeQuickPickItem[] = Array.from(indexes.get("registeredAssets")!.entries())
    .map(([storeName, shard]) => {
      const assetShard = shard as RegisteredAssetsIndexShard;
      return {
        label: storeName,
        detail: `${assetShard.path}/*${assetShard.extension} | ${assetShard.fileCount} assets`,
        assetShard,
      };
    })
    .sort((a, b) => b.assetShard.baseGameFileCount - a.assetShard.baseGameFileCount);
  const fullAssetCount = items.reduce((acc, item) => acc + item.assetShard!.baseGameFileCount, 0);
  const searchAllItem: AssetTypeQuickPickItem = {
    label: "Search all assets",
    detail: `${fullAssetCount} assets`,
  };
  items.unshift(searchAllItem);
  const selectedAssetType = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an asset type",
  });
  if (!selectedAssetType) {
    return;
  }
  const asset = await showAssetQuickPick(selectedAssetType.assetShard);
  if (!asset) {
    return;
  }
  let choseEmpty = asset.assetPath === undefined;
  let defaultName =
    asset.assetPath ??
    path.join(selectedAssetType.assetShard!.path, "NewAsset" + asset.fileExtension);
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
    copyAsset(context, asset.assetPath!, destinationPath)
      .then(() => {
        LOGGER.info(`Copied asset to ${destinationPath}`);
        // open asset in editor
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(destinationPath));
      })
      .catch(error => {
        LOGGER.error(`Failed to copy asset: ${error.message}`);
      });
  } else {
    await fs.promises.writeFile(destinationPath, "{\n\n}");
    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(destinationPath));
  }
}

async function showAssetQuickPick(
  assetShard?: RegisteredAssetsIndexShard,
): Promise<AssetQuickPickItem | undefined> {
  let items: AssetQuickPickItem[] = [];
  // all assets
  if (!assetShard) {
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
    if (assetShard.extension === ".json") {
      items.push({
        label: "Create empty asset",
        assetTypePath: assetShard.path,
        assetTypeName: assetShard.key,
        fileExtension: assetShard.extension,
      });
    }
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
          assetTypeName: assetShard.key,
          fileExtension: assetShard.extension,
        })),
    );
  }
  return vscode.window.showQuickPick(items, {
    placeHolder: "Select an asset to copy",
  });
}

async function copyAsset(
  context: vscode.ExtensionContext,
  assetPath: string,
  destinationPath: string,
): Promise<void> {
  if (assetPath.startsWith("/")) {
    assetPath = assetPath.slice(1);
  }
  const assetsZipPath = getAssetsZipPath(resolvePatchlineForContext(context));

  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  // extract asset from assets zip
  return new Promise((resolve, reject) => {
    yauzl.open(assetsZipPath, { lazyEntries: true }, (openError, zipFile) => {
      zipFile.readEntry();
      zipFile.on("entry", function (entry) {
        if (entry.fileName !== assetPath) {
          zipFile.readEntry();
        } else {
          zipFile.openReadStream(entry, (readError, readStream) => {
            if (readError) {
              throw new Error(`Failed to open read stream: ${readError.message}`);
            }
            readStream.pipe(fs.createWriteStream(destinationPath));
            zipFile.close();
          });
        }
      });
      zipFile.on("close", () => {
        resolve();
      });
    });
  });
}
