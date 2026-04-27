import { createWriteStream, existsSync } from "fs";
import { mkdir, readFile, readdir } from "fs/promises";
import path from "path";
import { type Readable } from "stream";
import { pipeline } from "stream/promises";
import { serialize as v8Serialize } from "v8";
import * as yauzl from "yauzl";
import { type SchemaRuntime } from "../schema/schemaLoader";
import { type BasicLogger } from "../shared/commonTypes";
import { type CachedAssetInstance, type JsonAssetInstance } from "../shared/fieldTypes";
import type {
  AssetDerivedIndexShard,
  CommonAssetPathsIndexShard,
  RegisteredAssetsIndexShard,
} from "../shared/indexTypes";
import { normalizePosixPath } from "../shared/pathUtils";
import { isObject } from "../shared/typeUtils";
import { AssetDerivedIndexRuntime } from "./assetDerivedIndexes";

export type AssetInstance = CachedAssetInstance;

type CachedZipAssetDescriptor = {
  assetName: string;
  assetType: string;
  contentType: AssetInstance["contentType"];
};

type AssetSourceKind = "workspaceFile" | "baseGamePackage";

export type AssetByteSource =
  | {
      kind: "baseGamePackageEntry";
      entryPath: string;
    }
  | {
      kind: "workspaceFile";
      fsPath: string;
    };

export type EffectiveAssetSourceInput = {
  resourceSubpath: string;
  sourceKind: AssetSourceKind;
  packageName?: string;
  byteSource?: AssetByteSource;
} & (
  | {
      contentType: "json";
      parsedJson?: unknown;
      parseError?: string;
    }
  | {
      contentType: "image";
      byteSource: AssetByteSource;
    }
);

type IndexedAssetRecord = {
  sourceKind: AssetSourceKind;
  assetType: string;
  assetName: string;
  path: string;
  package: string;
  contentType: AssetInstance["contentType"];
  byteSource: AssetByteSource;
  cachedAsset?: JsonAssetInstance;
  parseError?: string;
  inFlightLoad?: Promise<AssetInstance | undefined>;
};

type AssetSourceLayers = Partial<Record<AssetSourceKind, IndexedAssetRecord>>;

export class AssetCacheRuntime {
  /** asset type -> asset name -> cached asset instance */
  readonly assetInstances = new Map<string, Map<string, JsonAssetInstance>>();
  readonly derivedIndexes: Map<string, AssetDerivedIndexShard>;
  readonly assetsZipPath: string;
  readonly ready: Promise<void>;
  isReady = false;
  revision = 0;

  loadedAssetCount = 0;
  indexedAssetCount = 0;
  failedAssetCount = 0;

  private readonly logger: BasicLogger;
  private readonly schemaRuntime: SchemaRuntime;
  private readonly workspaceRootPaths: string[];
  private readonly derivedIndexRuntime = new AssetDerivedIndexRuntime();
  private readonly entryLocatorsByPath = new Map<string, yauzl.Entry>();
  private readonly workspaceResourcePaths = new Set<string>();
  private readonly sourceRecordsByPath = new Map<string, AssetSourceLayers>();
  private readonly recordsByPath = new Map<string, IndexedAssetRecord>();
  private readonly recordsByType = new Map<string, Map<string, IndexedAssetRecord>>();
  private zipFile: yauzl.ZipFile | undefined;
  private disposed = false;

  constructor(
    assetsZipPath: string,
    schemaRuntime: SchemaRuntime,
    logger: BasicLogger = console,
    workspaceRootPaths: string[] = [],
  ) {
    this.assetsZipPath = assetsZipPath;
    this.logger = logger;
    this.schemaRuntime = schemaRuntime;
    this.workspaceRootPaths = workspaceRootPaths;
    this.derivedIndexes = this.derivedIndexRuntime.derivedIndexes;
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
    return this.getRecordByPath(assetPath)?.cachedAsset;
  }

  async loadAsset(type: string, name: string): Promise<AssetInstance | undefined> {
    await this.ready;
    return await this.loadRecord(this.recordsByType.get(type)?.get(name));
  }

  async loadAssetByPath(assetPath: string): Promise<AssetInstance | undefined> {
    await this.ready;
    return await this.loadRecord(this.getRecordByPath(assetPath));
  }

  async readAssetBytesByPath(assetPath: string): Promise<Buffer | undefined> {
    await this.ready;
    const record = this.getRecordByPath(assetPath);
    if (record) {
      return await this.readRecordBytes(record);
    }
    const entry = this.getEntryByPath(assetPath);
    return entry ? await this.readEntryBytesByLocator(entry, assetPath) : undefined;
  }

  async readBaseGameAssetBytesByPath(assetPath: string): Promise<Buffer | undefined> {
    await this.ready;
    const entry = this.getEntryByPath(assetPath);
    return entry ? await this.readEntryBytesByLocator(entry, assetPath) : undefined;
  }

  async copyAssetByPath(assetPath: string, destinationPath: string): Promise<boolean> {
    return await this.copyBaseGameAssetByPath(assetPath, destinationPath);
  }

  async copyBaseGameAssetByPath(assetPath: string, destinationPath: string): Promise<boolean> {
    await this.ready;
    const entry = this.getEntryByPath(assetPath);
    if (!entry) {
      return false;
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    const readStream = await this.openEntryReadStream(entry);
    await pipeline(readStream, createWriteStream(destinationPath));
    return true;
  }

  getRegisteredAssetsShard(
    assetType: string,
    fallback?: RegisteredAssetsIndexShard,
  ): RegisteredAssetsIndexShard {
    const values: Record<string, { sourcedFromFile?: string; package?: string }> = {
      ...(fallback?.values ?? {}),
    };
    for (const [assetName, record] of this.recordsByType.get(assetType)?.entries() ?? []) {
      values[assetName] = {
        sourcedFromFile: record.path,
        package: record.package,
      };
    }

    return {
      hytaleVersion: fallback?.hytaleVersion ?? "runtime",
      generatedAt: fallback?.generatedAt ?? new Date().toISOString(),
      indexKind: "registeredAssets",
      key: assetType,
      path: fallback?.path ?? "",
      extension: fallback?.extension ?? "",
      assetCount: Object.keys(values).length,
      fileCount: Object.values(values).filter(value => Boolean(value.sourcedFromFile)).length,
      baseGameFileCount: Object.values(values).filter(
        value => value.sourcedFromFile && value.package === "Hytale:Hytale",
      ).length,
      values,
    };
  }

  getCommonAssetPathsShard(fallback?: CommonAssetPathsIndexShard): CommonAssetPathsIndexShard {
    const values: Record<string, Record<string, string[]>> = structuredClone(fallback?.values ?? {});
    const commonResourcePaths = new Set(
      [...this.entryLocatorsByPath.keys(), ...this.workspaceResourcePaths].filter(path =>
        path.startsWith("Common/"),
      ),
    );

    for (const resourcePath of commonResourcePaths) {
      const commonRelativePath = resourcePath.slice("Common/".length);
      const directParentFolder = path.posix.dirname(commonRelativePath);
      if (!directParentFolder || directParentFolder === ".") {
        continue;
      }

      const extension = path.posix.extname(commonRelativePath).replace(/^\./, "");
      if (!extension) {
        continue;
      }

      values[directParentFolder] ??= {};
      values[directParentFolder][extension] ??= [];
      const fileName = path.posix.basename(commonRelativePath);
      if (!values[directParentFolder][extension].includes(fileName)) {
        values[directParentFolder][extension].push(fileName);
      }
    }

    for (const filesByExtension of Object.values(values)) {
      for (const fileNames of Object.values(filesByExtension)) {
        fileNames.sort((left, right) => left.localeCompare(right));
      }
    }

    return {
      hytaleVersion: fallback?.hytaleVersion ?? "runtime",
      generatedAt: fallback?.generatedAt ?? new Date().toISOString(),
      indexKind: "commonAssetPaths",
      key: "all",
      values,
    };
  }

  processAssetSource(input: EffectiveAssetSourceInput): void {
    const resourcePath = normalizeAssetLookupPath(input.resourceSubpath);
    if (!isResourceSubpath(resourcePath)) {
      return;
    }
    if (input.sourceKind === "workspaceFile" && resourcePath.startsWith("Common/")) {
      this.workspaceResourcePaths.add(resourcePath);
    }

    const descriptor = resolveCachedZipAsset(resourcePath, this.schemaRuntime);
    if (!descriptor) {
      return;
    }

    const packageName =
      input.packageName ?? (input.sourceKind === "baseGamePackage" ? "Hytale:Hytale" : "Workspace");
    const byteSource =
      input.byteSource ??
      ({
        kind: "workspaceFile",
        fsPath: "",
      } satisfies AssetByteSource);
    const parseError = input.contentType === "json" ? input.parseError : undefined;
    const parsedJson =
      input.contentType === "json" && isObject(input.parsedJson) ? input.parsedJson : undefined;

    this.processSourceRecord(
      this.createSourceRecord(resourcePath, descriptor, {
        sourceKind: input.sourceKind,
        packageName,
        byteSource,
        cachedAsset:
          descriptor.contentType === "json" && parsedJson && !parseError
            ? {
                name: descriptor.assetName,
                type: descriptor.assetType,
                path: resourcePath,
                package: packageName,
                contentType: "json",
                rawJson: parsedJson,
              }
            : undefined,
        parseError:
          input.contentType === "json"
            ? parseError ?? (!parsedJson ? "Asset JSON root is not an object." : undefined)
            : undefined,
      }),
    );
  }

  async processWorkspaceFile(fsPath: string): Promise<void> {
    const resourcePath = normalizeAssetLookupPath(fsPath);
    if (!isResourceSubpath(resourcePath)) {
      return;
    }

    const descriptor = resolveCachedZipAsset(resourcePath, this.schemaRuntime);
    if (resourcePath.startsWith("Common/")) {
      this.workspaceResourcePaths.add(resourcePath);
    }
    if (!descriptor) {
      this.removeWorkspaceAssetSource(resourcePath);
      return;
    }

    if (descriptor.contentType === "json") {
      let parsed: unknown;
      let parseError: string | undefined;
      try {
        parsed = JSON.parse(stripBom(await readFile(fsPath, "utf8")));
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }

      this.processAssetSource({
        resourceSubpath: resourcePath,
        sourceKind: "workspaceFile",
        contentType: "json",
        parsedJson: parsed,
        parseError,
        byteSource: {
          kind: "workspaceFile",
          fsPath,
        },
      });
      return;
    }

    this.processAssetSource({
      resourceSubpath: resourcePath,
      sourceKind: "workspaceFile",
      contentType: "image",
      byteSource: {
        kind: "workspaceFile",
        fsPath,
      },
    });
  }

  removeWorkspaceFile(fsPath: string): void {
    const resourcePath = normalizeAssetLookupPath(fsPath);
    if (!isResourceSubpath(resourcePath)) {
      return;
    }
    this.workspaceResourcePaths.delete(resourcePath);
    this.removeWorkspaceAssetSource(resourcePath);
  }

  private removeWorkspaceAssetSource(resourcePath: string): void {
    const layers = this.sourceRecordsByPath.get(resourcePath);
    if (!layers?.workspaceFile) {
      return;
    }

    const previousEffectiveRecord = this.recordsByPath.get(resourcePath);
    delete layers.workspaceFile;
    if (!layers.baseGamePackage) {
      this.sourceRecordsByPath.delete(resourcePath);
    }
    this.updateEffectiveRecord(resourcePath, previousEffectiveRecord);
  }

  private getRecordByPath(assetPath: string): IndexedAssetRecord | undefined {
    const normalizedPath = normalizeAssetLookupPath(assetPath);
    return (
      this.recordsByPath.get(normalizedPath) ??
      (!normalizedPath.startsWith("Common/") && !normalizedPath.startsWith("Server/")
        ? this.recordsByPath.get(`Common/${normalizedPath}`)
        : undefined)
    );
  }

  private getEntryByPath(assetPath: string): yauzl.Entry | undefined {
    const normalizedPath = normalizeAssetLookupPath(assetPath);
    return (
      this.entryLocatorsByPath.get(normalizedPath) ??
      (!normalizedPath.startsWith("Common/") && !normalizedPath.startsWith("Server/")
        ? this.entryLocatorsByPath.get(`Common/${normalizedPath}`)
        : undefined)
    );
  }

  private async loadAssets(): Promise<void> {
    if (!existsSync(this.assetsZipPath)) {
      this.logger.warn(`Assets.zip not found for asset cache runtime: ${this.assetsZipPath}`);
    } else {
      await this.walkZipEntries();
    }

    await this.scanWorkspaceRoots();
    const cacheSizeBytes = v8Serialize(this.assetInstances).byteLength;

    this.logger.info(
      `Indexed asset cache ${this.assetsZipPath}: ${this.entryLocatorsByPath.size} base-game file paths, ${this.indexedAssetCount} supported effective assets across ${this.recordsByType.size} asset types. Eagerly cached ${this.loadedAssetCount} assets across ${this.assetInstances.size} asset types (${this.failedAssetCount} failed). Cache size: ${formatMegabytes(cacheSizeBytes)}.`,
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

            this.indexZipEntry(entry.fileName, entry);
            const assetDescriptor = resolveCachedZipAsset(entry.fileName, this.schemaRuntime);
            if (!assetDescriptor) {
              zipFile.readEntry();
              return;
            }

            const record = this.createBaseGameRecord(entry.fileName, assetDescriptor);

            if (!shouldEagerCache(record)) {
              this.processSourceRecord(record);
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
                  this.processSourceRecord(record);
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

  private async scanWorkspaceRoots(): Promise<void> {
    for (const workspaceRootPath of this.workspaceRootPaths) {
      await this.scanWorkspaceDirectory(workspaceRootPath);
    }
  }

  private async scanWorkspaceDirectory(directoryPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await this.scanWorkspaceDirectory(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const resourcePath = normalizeAssetLookupPath(entryPath);
      if (!isResourceSubpath(resourcePath)) {
        continue;
      }

      if (!resolveCachedZipAsset(resourcePath, this.schemaRuntime)) {
        continue;
      }

      await this.processWorkspaceFile(entryPath);
    }
  }

  private indexZipEntry(entryPath: string, locator: yauzl.Entry): void {
    const normalizedPath = normalizeAssetLookupPath(entryPath);
    if (this.entryLocatorsByPath.has(normalizedPath)) {
      this.logger.warn(`Duplicate asset cache zip path for ${normalizedPath}. Overwriting previous entry.`);
    }
    this.entryLocatorsByPath.set(normalizedPath, locator);
  }

  private createBaseGameRecord(
    entryPath: string,
    assetDescriptor: CachedZipAssetDescriptor,
  ): IndexedAssetRecord {
    const normalizedPath = normalizeAssetLookupPath(entryPath);
    return this.createSourceRecord(normalizedPath, assetDescriptor, {
      sourceKind: "baseGamePackage",
      packageName: "Hytale:Hytale",
      byteSource: {
        kind: "baseGamePackageEntry",
        entryPath: normalizedPath,
      },
    });
  }

  private createSourceRecord(
    normalizedPath: string,
    assetDescriptor: CachedZipAssetDescriptor,
    options: {
      sourceKind: AssetSourceKind;
      packageName: string;
      byteSource: AssetByteSource;
      cachedAsset?: JsonAssetInstance;
      parseError?: string;
    },
  ): IndexedAssetRecord {
    return {
      sourceKind: options.sourceKind,
      assetType: assetDescriptor.assetType,
      assetName: assetDescriptor.assetName,
      path: normalizedPath,
      package: options.packageName,
      contentType: assetDescriptor.contentType,
      byteSource: options.byteSource,
      cachedAsset: options.cachedAsset,
      parseError: options.parseError,
    };
  }

  private processSourceRecord(record: IndexedAssetRecord): void {
    let layers = this.sourceRecordsByPath.get(record.path);
    if (!layers) {
      layers = {};
      this.sourceRecordsByPath.set(record.path, layers);
    }

    const previousEffectiveRecord = this.recordsByPath.get(record.path);
    layers[record.sourceKind] = record;
    this.updateEffectiveRecord(record.path, previousEffectiveRecord);
  }

  private updateEffectiveRecord(
    normalizedPath: string,
    previousEffectiveRecord: IndexedAssetRecord | undefined,
  ): void {
    const nextEffectiveRecord = this.resolveEffectiveRecord(this.sourceRecordsByPath.get(normalizedPath));
    if (previousEffectiveRecord) {
      this.removeEffectiveRecord(previousEffectiveRecord);
    }

    if (nextEffectiveRecord) {
      this.addEffectiveRecord(nextEffectiveRecord);
    } else {
      this.recordsByPath.delete(normalizedPath);
    }

    this.indexedAssetCount = this.recordsByPath.size;
    this.revision += 1;
    this.updateDerivedIndexesForRecord(normalizedPath, nextEffectiveRecord);
  }

  private resolveEffectiveRecord(layers: AssetSourceLayers | undefined): IndexedAssetRecord | undefined {
    return (
      this.validEffectiveRecord(layers?.workspaceFile) ??
      this.validEffectiveRecord(layers?.baseGamePackage)
    );
  }

  private validEffectiveRecord(record: IndexedAssetRecord | undefined): IndexedAssetRecord | undefined {
    return record && !record.parseError ? record : undefined;
  }

  private addEffectiveRecord(record: IndexedAssetRecord): void {
    this.recordsByPath.set(record.path, record);
    if (!this.recordsByType.has(record.assetType)) {
      this.recordsByType.set(record.assetType, new Map<string, IndexedAssetRecord>());
    }

    const existingTypeRecord = this.recordsByType.get(record.assetType)!.get(record.assetName);
    if (existingTypeRecord && existingTypeRecord.path !== record.path) {
      this.logger.warn(
        `Duplicate asset cache key for ${record.assetType}/${record.assetName}. Overwriting previous asset with ${record.path}.`,
      );
    }

    this.recordsByType.get(record.assetType)!.set(record.assetName, record);

    if (record.cachedAsset) {
      this.setAssetInstance(record.assetType, record.assetName, record.cachedAsset);
    }
  }

  private removeEffectiveRecord(record: IndexedAssetRecord): void {
    if (this.recordsByPath.get(record.path) === record) {
      this.recordsByPath.delete(record.path);
    }

    const recordsForType = this.recordsByType.get(record.assetType);
    if (recordsForType?.get(record.assetName) === record) {
      recordsForType.delete(record.assetName);
      if (recordsForType.size === 0) {
        this.recordsByType.delete(record.assetType);
      }
    }

    const assetsForType = this.assetInstances.get(record.assetType);
    if (assetsForType?.get(record.assetName)?.path === record.path) {
      assetsForType.delete(record.assetName);
      this.loadedAssetCount = Math.max(0, this.loadedAssetCount - 1);
      if (assetsForType.size === 0) {
        this.assetInstances.delete(record.assetType);
      }
    }
  }

  private updateDerivedIndexesForRecord(
    resourceSubpath: string,
    record: IndexedAssetRecord | undefined,
  ): void {
    this.derivedIndexRuntime.updateForAsset(resourceSubpath, record?.cachedAsset);
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
      switch (record.byteSource.kind) {
        case "baseGamePackageEntry": {
          const entry = this.getEntryByPath(record.byteSource.entryPath);
          return entry ? await this.openEntryBytes(entry) : undefined;
        }
        case "workspaceFile":
          return Buffer.from(await readFile(record.byteSource.fsPath));
      }
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

  private async readEntryBytesByLocator(
    entry: yauzl.Entry,
    assetPathForLogging: string,
  ): Promise<Buffer | undefined> {
    try {
      return await this.openEntryBytes(entry);
    } catch (error) {
      if (!this.disposed) {
        this.failedAssetCount += 1;
        this.logger.warn(
          `Failed to read asset cache entry ${assetPathForLogging}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return undefined;
    }
  }

  private async openEntryBytes(entry: yauzl.Entry): Promise<Buffer> {
    const readStream = await this.openEntryReadStream(entry);
    return await this.readEntryBytes(readStream);
  }

  private async openEntryReadStream(entry: yauzl.Entry): Promise<Readable> {
    const zipFile = this.zipFile;
    if (!zipFile || this.disposed) {
      throw new Error("Asset cache zip is unavailable.");
    }

    return await new Promise<Readable>((resolve, reject) => {
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

  const normalizedPath = normalizeAssetLookupPath(entryPath);
  if (extension === ".json" && normalizedPath.startsWith("Server/NPC/Roles/")) {
    return {
      assetType: "NPCRole",
      assetName: getAssetNameRelativeToFolder(normalizedPath, "Server/NPC/Roles/"),
      contentType: "json",
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

function getAssetNameRelativeToFolder(entryPath: string, folderPrefix: string): string {
  const withoutExtension = entryPath.slice(
    0,
    entryPath.length - path.posix.extname(entryPath).length,
  );
  return withoutExtension.startsWith(folderPrefix)
    ? withoutExtension.slice(folderPrefix.length)
    : getFileNameWithoutExtension(entryPath);
}

/** Converts any path to its Common/ or Server/ based relative path. */
export function normalizeAssetLookupPath(inputPath: string): string {
  const normalizedPath = normalizePosixPath(inputPath).replace(/^\/+/, "");
  const rootIndices = [normalizedPath.indexOf("Common/"), normalizedPath.indexOf("Server/")].filter(
    index => index >= 0,
  );

  if (rootIndices.length === 0) {
    return normalizedPath;
  }

  return normalizedPath.slice(Math.min(...rootIndices));
}

function isResourceSubpath(inputPath: string): boolean {
  return inputPath.startsWith("Common/") || inputPath.startsWith("Server/");
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
