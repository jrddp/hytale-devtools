import path from "node:path";
import { describe, expect, test } from "vitest";
import { SchemaRuntime } from "../../src/schema/schemaLoader";

describe("asset editor schema loading", () => {
  test("includes inline-or-reference refs in Item schema refDependencies", () => {
    const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
    const logger = {
      error() {},
      warn() {},
      info() {},
      debug() {},
    };
    const runtime = new SchemaRuntime(schemaDir, logger);
    const itemAsset = runtime.assetsByRef.get("Item.json#");

    expect(itemAsset).toBeDefined();
    expect(itemAsset?.refDependencies.has("RootInteraction.json#")).toBe(true);
  });
});
