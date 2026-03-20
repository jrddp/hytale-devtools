import { existsSync } from "fs";
import path from "path";
import { type Readable } from "stream";
import { serialize as v8Serialize } from "v8";
import * as yauzl from "yauzl";
import { type SchemaRuntime } from "../schema/schemaLoader";
import { type BasicLogger } from "../shared/commonTypes";
import { type CachedAssetInstance, type JsonAssetInstance } from "../shared/fieldTypes";
import { isObject } from "../shared/typeUtils";

export type AssetInstance = CachedAssetInstance;

type CachedZipAssetDescriptor = {
  assetName: string;
  assetType: string;
  contentType: AssetInstance["contentType"];
};

type IndexedAssetRecord = {
  assetType: string;
  assetName: string;
  path: string;
  package: string;
  contentType: AssetInstance["contentType"];
  locator: yauzl.Entry;
  cachedAsset?: JsonAssetInstance;
  inFlightLoad?: Promise<AssetInstance | undefined>;
};

export class AssetCacheRuntime {
  /** asset type -> asset name -> cached asset instance */
  readonly assetInstances = new Map<string, Map<string, JsonAssetInstance>>();
  readonly assetsZipPath: string;
  readonly ready: Promise<void>;
  isReady = false;

  loadedAssetCount = 0;
  indexedAssetCount = 0;
  failedAssetCount = 0;

  private readonly logger: BasicLogger;
  private readonly schemaRuntime: SchemaRuntime;
  private readonly recordsByPath = new Map<string, IndexedAssetRecord>();
  private readonly recordsByType = new Map<string, Map<string, IndexedAssetRecord>>();
  private zipFile: yauzl.ZipFile | undefined;
  private disposed = false;

  constructor(assetsZipPath: string, schemaRuntime: SchemaRuntime, logger: BasicLogger = console) {
    this.assetsZipPath = assetsZipPath;
    this.logger = logger;
    this.schemaRuntime = schemaRuntime;
    this.ready = this.loadAssets().finally(() => {
      this.isReady = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    const zipFile = this.zipFile;
    this.zipFile = undefined;
    if (zipFile?.isOpen) {
      zipFile.close();
    }
  }

  getAssetsOfType(type: string): Map<string, JsonAssetInstance> | undefined {
    return this.assetInstances.get(type);
  }

  getAsset(type: string, name: string): JsonAssetInstance | undefined {
    return this.recordsByType.get(type)?.get(name)?.cachedAsset;
  }

  getAssetByPath(assetPath: string): JsonAssetInstance | undefined {
    return this.recordsByPath.get(normalizeAssetLookupPath(assetPath))?.cachedAsset;
  }

  async loadAsset(type: string, name: string): Promise<AssetInstance | undefined> {
    await this.ready;
    return await this.loadRecord(this.recordsByType.get(type)?.get(name));
  }

  async loadAssetByPath(assetPath: string): Promise<AssetInstance | undefined> {
    await this.ready;
    return await this.loadRecord(this.recordsByPath.get(normalizeAssetLookupPath(assetPath)));
  }

  async readAssetBytesByPath(assetPath: string): Promise<Buffer | undefined> {
    await this.ready;
    const record = this.recordsByPath.get(normalizeAssetLookupPath(assetPath));
    if (!record) {
      return undefined;
    }
    return await this.readRecordBytes(record);
  }

  private async loadAssets(): Promise<void> {
    if (!existsSync(this.assetsZipPath)) {
      this.logger.warn(`Assets.zip not found for asset cache runtime: ${this.assetsZipPath}`);
      return;
    }

    await this.walkZipEntries();
    const cacheSizeBytes = v8Serialize(this.assetInstances).byteLength;

    this.logger.info(
      `Indexed base-game asset zip ${this.assetsZipPath}: ${this.indexedAssetCount} supported assets across ${this.recordsByType.size} asset types. Eagerly cached ${this.loadedAssetCount} assets across ${this.assetInstances.size} asset types (${this.failedAssetCount} failed). Cache size: ${formatMegabytes(cacheSizeBytes)}.`,
    );
  }

  private async walkZipEntries(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      yauzl.open(
        this.assetsZipPath,
        { lazyEntries: true, autoClose: false },
        (openError, zipFile) => {
          if (openError) {
            reject(openError);
            return;
          }
          if (!zipFile) {
            reject(new Error("Failed to open assets zip."));
            return;
          }

          this.zipFile = zipFile;
          let settled = false;

          const resolveOnce = () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve();
          };

          const rejectOnce = (error: Error) => {
            if (settled) {
              return;
            }
            if (this.disposed) {
              settled = true;
              resolve();
              return;
            }
            settled = true;
            reject(error);
          };

          zipFile.on("error", rejectOnce);
          zipFile.on("close", () => {
            if (this.zipFile === zipFile) {
              this.zipFile = undefined;
            }
            if (this.disposed) {
              resolveOnce();
            }
          });
          zipFile.on("end", resolveOnce);

          zipFile.on("entry", (entry: yauzl.Entry) => {
            if (this.disposed) {
              zipFile.close();
              return;
            }

            if (entry.fileName.endsWith("/")) {
              zipFile.readEntry();
              return;
            }

            const assetDescriptor = resolveCachedZipAsset(entry.fileName, this.schemaRuntime);
            if (!assetDescriptor) {
              zipFile.readEntry();
              return;
            }

            const record = this.indexZipRecord(entry.fileName, assetDescriptor, entry);

            if (!shouldEagerCache(record)) {
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

              this.readEntryBytes(readStream)
                .then(content => {
                  const asset = this.materializeAsset(record, content);
                  if (!asset || asset.contentType !== "json") {
                    return;
                  }
                  record.cachedAsset = asset;
                  this.setAssetInstance(record.assetType, record.assetName, asset);
                })
                .catch(error => {
                  this.failedAssetCount += 1;
                  this.logger.warn(
                    `Failed to read asset cache entry ${entry.fileName}: ${error instanceof Error ? error.message : String(error)}`,
                  );
                })
                .finally(() => {
                  if (!this.disposed && !settled) {
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

  private indexZipRecord(
    entryPath: string,
    assetDescriptor: CachedZipAssetDescriptor,
    locator: yauzl.Entry,
  ): IndexedAssetRecord {
    const normalizedPath = normalizeAssetLookupPath(entryPath);
    const record: IndexedAssetRecord = {
      assetType: assetDescriptor.assetType,
      assetName: assetDescriptor.assetName,
      path: normalizedPath,
      package: "Hytale:Hytale",
      contentType: assetDescriptor.contentType,
      locator,
    };

    const existingPathRecord = this.recordsByPath.get(normalizedPath);
    if (existingPathRecord) {
      this.logger.warn(
        `Duplicate asset cache path for ${normalizedPath}. Overwriting previous ${existingPathRecord.assetType}/${existingPathRecord.assetName}.`,
      );
    }
    this.recordsByPath.set(normalizedPath, record);

    if (!this.recordsByType.has(assetDescriptor.assetType)) {
      this.recordsByType.set(assetDescriptor.assetType, new Map<string, IndexedAssetRecord>());
    }

    const existingTypeRecord = this.recordsByType.get(assetDescriptor.assetType)!.get(
      assetDescriptor.assetName,
    );
    if (existingTypeRecord) {
      this.logger.warn(
        `Duplicate asset cache key for ${assetDescriptor.assetType}/${assetDescriptor.assetName}. Overwriting previous asset with ${normalizedPath}.`,
      );
    }

    this.recordsByType.get(assetDescriptor.assetType)!.set(assetDescriptor.assetName, record);
    this.indexedAssetCount += 1;
    return record;
  }

  private async loadRecord(record: IndexedAssetRecord | undefined): Promise<AssetInstance | undefined> {
    if (!record) {
      return undefined;
    }

    if (record.cachedAsset) {
      return record.cachedAsset;
    }

    if (record.inFlightLoad) {
      return await record.inFlightLoad;
    }

    record.inFlightLoad = this.readRecordBytes(record)
      .then(content => {
        if (!content) {
          return undefined;
        }

        const asset = this.materializeAsset(record, content);
        if (!asset) {
          return undefined;
        }

        if (shouldMemoizeLoadedAsset(record, asset)) {
          record.cachedAsset = asset;
          this.setAssetInstance(record.assetType, record.assetName, asset);
        }

        return asset;
      })
      .finally(() => {
        record.inFlightLoad = undefined;
      });

    return await record.inFlightLoad;
  }

  private async readRecordBytes(record: IndexedAssetRecord): Promise<Buffer | undefined> {
    try {
      return await this.openEntryBytes(record.locator);
    } catch (error) {
      if (!this.disposed) {
        this.failedAssetCount += 1;
        this.logger.warn(
          `Failed to read asset cache entry ${record.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return undefined;
    }
  }

  private async openEntryBytes(entry: yauzl.Entry): Promise<Buffer> {
    const zipFile = this.zipFile;
    if (!zipFile || this.disposed) {
      throw new Error("Asset cache zip is unavailable.");
    }

    const readStream = await new Promise<Readable>((resolve, reject) => {
      zipFile.openReadStream(entry, (readError, stream) => {
        if (readError) {
          reject(readError);
          return;
        }
        if (!stream) {
          reject(new Error(`Missing asset cache stream for ${entry.fileName}.`));
          return;
        }
        resolve(stream);
      });
    });

    return await this.readEntryBytes(readStream);
  }

  private async readEntryBytes(readStream: Readable): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      readStream.on("data", chunk => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      readStream.on("error", reject);
      readStream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  private materializeAsset(
    record: Pick<IndexedAssetRecord, "assetName" | "assetType" | "contentType" | "package" | "path">,
    content: Buffer,
  ): AssetInstance | undefined {
    if (record.contentType === "image") {
      return {
        name: record.assetName,
        type: record.assetType,
        path: record.path,
        package: record.package,
        contentType: "image",
        bytes: content,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(content.toString("utf8")));
    } catch (error) {
      this.failedAssetCount += 1;
      this.logger.warn(
        `Failed to parse cached asset JSON for ${record.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }

    if (!isObject(parsed)) {
      this.failedAssetCount += 1;
      this.logger.warn(`Skipping non-object cached asset ${record.path}.`);
      return undefined;
    }

    return {
      name: record.assetName,
      type: record.assetType,
      path: record.path,
      package: record.package,
      contentType: "json",
      rawJson: parsed,
    };
  }

  private setAssetInstance(
    assetType: string,
    assetName: string,
    asset: JsonAssetInstance,
  ): void {
    if (!this.assetInstances.has(assetType)) {
      this.assetInstances.set(assetType, new Map<string, JsonAssetInstance>());
    }

    if (this.assetInstances.get(assetType)!.has(assetName)) {
      this.logger.warn(
        `Duplicate cached asset instance for ${assetType}/${assetName}. Overwriting previous asset with ${asset.path}.`,
      );
    } else {
      this.loadedAssetCount += 1;
    }

    this.assetInstances.get(assetType)!.set(assetName, asset);
  }
}

export function resolveCachedZipAsset(
  entryPath: string,
  schemaRuntime: Pick<SchemaRuntime, "getAssetDefinitionForPath">,
): CachedZipAssetDescriptor | undefined {
  const extension = path.posix.extname(entryPath);

  if (extension === ".blockymodel") {
    return {
      assetType: "Model",
      assetName: getRootRelativeAssetName(entryPath),
      contentType: "json",
    };
  }

  if (extension === ".png") {
    return {
      assetType: "Texture",
      assetName: getRootRelativeAssetName(entryPath),
      contentType: "image",
    };
  }

  const assetType = schemaRuntime.getAssetDefinitionForPath(entryPath)?.title;
  if (!assetType) {
    return undefined;
  }

  return {
    assetType,
    assetName: getFileNameWithoutExtension(entryPath),
    contentType: "json",
  };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function formatMegabytes(byteSize: number): string {
  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`;
}

function getRootRelativeAssetName(entryPath: string): string {
  const normalizedPath = normalizeAssetLookupPath(entryPath);
  const withoutExtension = normalizedPath.slice(
    0,
    normalizedPath.length - path.posix.extname(normalizedPath).length,
  );
  const firstSlashIndex = withoutExtension.indexOf("/");
  return firstSlashIndex >= 0 ? withoutExtension.slice(firstSlashIndex + 1) : withoutExtension;
}

function getFileNameWithoutExtension(entryPath: string): string {
  const assetFile = path.posix.basename(entryPath);
  const extension = path.posix.extname(assetFile);
  return extension ? assetFile.slice(0, -extension.length) : assetFile;
}

/** Converts any path to its Common/ or Server/ based relative path. */
function normalizeAssetLookupPath(inputPath: string): string {
  const normalizedPath = inputPath.replaceAll("\\", "/").replace(/^\/+/, "");
  const rootIndices = [normalizedPath.indexOf("Common/"), normalizedPath.indexOf("Server/")].filter(
    index => index >= 0,
  );

  if (rootIndices.length === 0) {
    return normalizedPath;
  }

  return normalizedPath.slice(Math.min(...rootIndices));
}

function shouldEagerCache(record: Pick<IndexedAssetRecord, "assetType" | "contentType">): boolean {
  return record.contentType === "json" && record.assetType !== "Model";
}

function shouldMemoizeLoadedAsset(
  record: Pick<IndexedAssetRecord, "assetType">,
  asset: AssetInstance,
): asset is JsonAssetInstance {
  return asset.contentType === "json" && record.assetType !== "Model";
}
