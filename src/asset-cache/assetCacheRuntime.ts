import { existsSync } from "fs";
import path from "path";
import { type Readable } from "stream";
import { serialize as v8Serialize } from "v8";
import * as yauzl from "yauzl";
import { type SchemaRuntime } from "../schema/schemaLoader";
import { type BasicLogger } from "../shared/commonTypes";
import { isObject } from "../shared/typeUtils";

export type AssetInstance = {
  name: string;
  type: string;
  path: string;
  package: string;
  rawJson: Record<string, unknown>;
};

export class AssetCacheRuntime {
  /** asset type -> asset name -> asset instance */
  readonly assetInstances = new Map<string, Map<string, AssetInstance>>();
  readonly assetsZipPath: string;
  readonly ready: Promise<void>;
  isReady = false;

  loadedAssetCount = 0;
  failedAssetCount = 0;

  private readonly logger: BasicLogger;
  private readonly schemaRuntime: SchemaRuntime;

  constructor(assetsZipPath: string, schemaRuntime: SchemaRuntime, logger: BasicLogger = console) {
    this.assetsZipPath = assetsZipPath;
    this.logger = logger;
    this.schemaRuntime = schemaRuntime;
    this.ready = this.loadAssets().finally(() => {
      this.isReady = true;
    });
  }

  getAssetsOfType(type: string): Map<string, AssetInstance> | undefined {
    return this.assetInstances.get(type);
  }

  getAsset(type: string, name: string): AssetInstance | undefined {
    return this.assetInstances.get(type)?.get(name);
  }

  private async loadAssets(): Promise<void> {
    if (!existsSync(this.assetsZipPath)) {
      this.logger.warn(`Assets.zip not found for asset cache runtime: ${this.assetsZipPath}`);
      return;
    }

    await this.walkZipEntries();
    const cacheSizeBytes = v8Serialize(this.assetInstances).byteLength;

    this.logger.info(
      `Loaded base-game asset cache from ${this.assetsZipPath}: ${this.loadedAssetCount} assets across ${this.assetInstances.size} asset types (${this.failedAssetCount} failed). Cache size: ${formatMegabytes(cacheSizeBytes)}.`,
    );
  }

  private async walkZipEntries(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      yauzl.open(
        this.assetsZipPath,
        { lazyEntries: true, autoClose: true },
        (openError, zipFile) => {
          if (openError) {
            reject(openError);
            return;
          }
          if (!zipFile) {
            reject(new Error("Failed to open assets zip."));
            return;
          }

          let settled = false;

          const finishWithError = (error: Error) => {
            if (settled) {
              return;
            }
            settled = true;
            reject(error);
          };

          zipFile.on("error", finishWithError);
          zipFile.on("close", () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          });

          zipFile.on("entry", (entry: yauzl.Entry) => {
            if (entry.fileName.endsWith("/")) {
              zipFile.readEntry();
              return;
            }

            const assetType = this.schemaRuntime.getAssetDefinitionForPath(entry.fileName)?.title;
            if (!assetType) {
              // skip entries that don't match any patterns for supported schema
              zipFile.readEntry();
              return;
            }

            zipFile.openReadStream(entry, (readError, readStream) => {
              if (readError) {
                this.failedAssetCount += 1;
                this.logger.warn(
                  `Failed to open asset cache stream for ${entry.fileName}: ${readError.message}`,
                );
                zipFile.readEntry();
                return;
              }
              if (!readStream) {
                this.failedAssetCount += 1;
                this.logger.warn(`Missing asset cache stream for ${entry.fileName}.`);
                zipFile.readEntry();
                return;
              }

              this.readEntryText(readStream)
                .then(text => {
                  this.storeZipAsset(assetType, entry.fileName, text);
                })
                .catch(error => {
                  this.failedAssetCount += 1;
                  this.logger.warn(
                    `Failed to read asset cache entry ${entry.fileName}: ${error instanceof Error ? error.message : String(error)}`,
                  );
                })
                .finally(() => {
                  if (!settled) {
                    zipFile.readEntry();
                  }
                });
            });
          });

          zipFile.readEntry();
        },
      );
    });
  }

  private async readEntryText(readStream: Readable): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];

      readStream.on("data", chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      readStream.on("error", reject);
      readStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  }

  private storeZipAsset(assetType: string, entryPath: string, text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(text));
    } catch (error) {
      this.failedAssetCount += 1;
      this.logger.warn(
        `Failed to parse cached asset JSON for ${entryPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    if (!isObject(parsed)) {
      this.failedAssetCount += 1;
      this.logger.warn(`Skipping non-object cached asset ${entryPath}.`);
      return;
    }

    const assetFile = path.posix.basename(entryPath);
    const assetName = assetFile.substring(0, assetFile.lastIndexOf("."));

    if (!this.assetInstances.has(assetType)) {
      this.assetInstances.set(assetType, new Map<string, AssetInstance>());
    }

    if (this.assetInstances.get(assetType)!.has(assetName)) {
      this.logger.warn(
        `Duplicate asset cache key for ${assetType}/${assetName}. Overwriting previous asset with ${entryPath}.`,
      );
    }

    this.assetInstances.get(assetType)!.set(assetName, {
      name: assetName,
      type: assetType,
      path: entryPath,
      package: "Hytale:Hytale",
      rawJson: parsed,
    });

    this.loadedAssetCount += 1;
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function formatMegabytes(byteSize: number): string {
  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`;
}
