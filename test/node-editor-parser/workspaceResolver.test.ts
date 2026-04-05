import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { WorkspaceRuntime } from "../../src/node-editor/workspaceResolver";
import { SchemaRuntime } from "../../src/schema/schemaLoader";
import * as fileUtils from "../../src/shared/fileUtils";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");
const workspacesRootPath = path.resolve(process.cwd(), "default-data/node-editor-workspace-definitions");

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

describe("WorkspaceRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("resolves workspace context for Windows-style asset paths", () => {
    const actualSafeParseJsonFile = fileUtils.safeParseJSONFile;
    vi.spyOn(fileUtils, "safeParseJSONFile").mockImplementation((filePath: string) => {
      if (filePath === "C:\\Users\\Test\\Assets\\Server\\HytaleGenerator\\Biomes\\ExampleBiome.json") {
        return {};
      }

      return actualSafeParseJsonFile(filePath);
    });

    const schemaRuntime = new SchemaRuntime(schemaDir, logger);
    const workspaceRuntime = new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);

    const workspaceContext = workspaceRuntime.resolveWorkspaceContext(
      "C:\\Users\\Test\\Assets\\Server\\HytaleGenerator\\Biomes\\ExampleBiome.json",
    );

    expect(workspaceContext).not.toBeNull();
    expect(workspaceContext?.rootMenuName).toBe("HytaleGenerator - Biome");
    expect(workspaceContext?.rootTemplateOrVariantId).toBe("Biome");
  });
});
