import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { serialize as v8Serialize } from "node:v8";
import { AssetCacheRuntime } from "../src/asset-cache/assetCacheRuntime";
import { SchemaRuntime } from "../src/schema/schemaLoader";
import type { BasicLogger } from "../src/shared/commonTypes";

const ASSETS_ZIP_PATH_ENV = "ASSETS_ZIP_PATH";
const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");

loadDotEnv(path.resolve(process.cwd(), ".env"));

function loadDotEnv(envPath: string): void {
  if (!existsSync(envPath)) {
    return;
  }

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (process.env[key]) {
      continue;
    }

    const value = line.slice(equalsIndex + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

function formatMegabytes(byteSize: number): string {
  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(milliseconds: number): string {
  return `${milliseconds.toFixed(0)} ms (${(milliseconds / 1000).toFixed(2)} s)`;
}

function cacheMapToObject<TValue>(cacheMap: Map<string, TValue>): Record<string, TValue> {
  return Object.fromEntries(cacheMap);
}

function formatPerTypeLine({
  assetType,
  count,
  v8ByteSize,
  jsonByteSize,
}: {
  assetType: string;
  count: number;
  v8ByteSize: number;
  jsonByteSize: number;
}): string {
  return [
    `${assetType}`,
    `count=${count}`,
    `v8=${formatMegabytes(v8ByteSize)}`,
    `json=${formatMegabytes(jsonByteSize)}`,
  ].join(" | ");
}

async function main(): Promise<void> {
  const assetsZipPath = process.argv[2] ?? process.env[ASSETS_ZIP_PATH_ENV];
  if (!assetsZipPath) {
    throw new Error(
      `Missing Assets.zip path. Set ${ASSETS_ZIP_PATH_ENV} in .env or pass it as the first argument.`,
    );
  }

  const normalizedAssetsZipPath = path.resolve(assetsZipPath);
  if (!existsSync(normalizedAssetsZipPath)) {
    throw new Error(`Assets.zip not found: ${normalizedAssetsZipPath}`);
  }

  const silentLogger: BasicLogger = {
    error() {},
    warn() {},
    info() {},
  };

  const schemaRuntime = new SchemaRuntime(schemaDir, silentLogger);

  const loadStart = performance.now();
  const assetCacheRuntime = new AssetCacheRuntime(
    normalizedAssetsZipPath,
    schemaRuntime,
    silentLogger,
  );
  await assetCacheRuntime.ready;
  const loadElapsedMs = performance.now() - loadStart;

  const totalCacheObject = cacheMapToObject(
    new Map(
      Array.from(assetCacheRuntime.assetInstances.entries()).map(([assetType, assets]) => [
        assetType,
        cacheMapToObject(assets),
      ]),
    ),
  );
  const totalV8ByteSize = v8Serialize(assetCacheRuntime.assetInstances).byteLength;
  const totalJsonByteSize = Buffer.byteLength(JSON.stringify(totalCacheObject), "utf8");

  const perTypeSummaries = Array.from(assetCacheRuntime.assetInstances.entries())
    .map(([assetType, assets]) => {
      const assetsObject = cacheMapToObject(assets);
      return {
        assetType,
        count: assets.size,
        v8ByteSize: v8Serialize(assets).byteLength,
        jsonByteSize: Buffer.byteLength(JSON.stringify(assetsObject), "utf8"),
      };
    })
    .sort((left, right) => right.v8ByteSize - left.v8ByteSize);

  console.log(`Assets zip: ${normalizedAssetsZipPath}`);
  console.log(`Load time: ${formatDuration(loadElapsedMs)}`);
  console.log(`Indexed asset count: ${assetCacheRuntime.indexedAssetCount}`);
  console.log(`Cached asset types: ${assetCacheRuntime.assetInstances.size}`);
  console.log(`Cached assets: ${assetCacheRuntime.loadedAssetCount}`);
  console.log(
    `V8 serialized size: ${formatMegabytes(totalV8ByteSize)} (${totalV8ByteSize} bytes)`,
  );
  console.log(`JSON size: ${formatMegabytes(totalJsonByteSize)} (${totalJsonByteSize} bytes)`);
  console.log("Largest asset types by V8 serialized size:");
  for (const summary of perTypeSummaries.slice(0, 25)) {
    console.log(`- ${formatPerTypeLine(summary)}`);
  }
  if (assetCacheRuntime.failedAssetCount > 0) {
    console.log(`Failed to parse: ${assetCacheRuntime.failedAssetCount}`);
  }

  assetCacheRuntime.dispose();
}

void main();
