import fs from "node:fs";
import os from "node:os";
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

const tempDirectories: string[] = [];

describe("WorkspaceRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of tempDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
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

  test("hydrates workspace symbol lookups and schema fallback symbol refs for scalar and list fields", () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-test-"));
    tempDirectories.push(workspaceRoot);
    const workspacesDir = path.join(workspaceRoot, "workspaces");
    const supplementsDir = path.join(workspaceRoot, "supplements");
    const workspaceDir = path.join(workspacesDir, "TestWorkspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(supplementsDir, { recursive: true });

    fs.writeFileSync(
      path.join(workspaceDir, "_Workspace.json"),
      JSON.stringify(
        {
          WorkspaceName: "Test Workspace",
          Roots: {
            Root: {
              RootNodeType: "SchemaListFallback",
              MenuName: "Test Workspace",
            },
          },
          NodeCategories: {
            General: [
              "SchemaListFallback",
              "SchemaStringFallback",
              "ExplicitSymbolLookup",
              "AnimationPreviewField",
              "TupleField",
              "UniqueListField",
            ],
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(workspaceDir, "SchemaListFallback.json"),
      JSON.stringify(
        {
          Id: "SchemaListFallback",
          Title: "Schema List Fallback",
          Color: "#123456",
          Content: [
            {
              Id: "ObjectiveIds",
              Type: "List",
              Options: {
                Label: "ObjectiveIds",
              },
            },
          ],
          Schema: {
            ObjectiveIds: "ObjectiveIds",
            Type: "ObjectiveLineAsset",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(workspaceDir, "SchemaStringFallback.json"),
      JSON.stringify(
        {
          Id: "SchemaStringFallback",
          Title: "Schema String Fallback",
          Color: "#123456",
          Content: [
            {
              Id: "WorldRemovalSoundEventId",
              Type: "SmallString",
              Options: {
                Label: "WorldRemovalSoundEventId",
              },
            },
          ],
          Schema: {
            WorldRemovalSoundEventId: "WorldRemovalSoundEventId",
            Type: "EntityEffect",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(workspaceDir, "ExplicitSymbolLookup.json"),
      JSON.stringify(
        {
          Id: "ExplicitSymbolLookup",
          Title: "Explicit Symbol Lookup",
          Color: "#123456",
          Content: [
            {
              Id: "ObjectiveIds",
              Type: "List",
              Options: {
                Label: "ObjectiveIds",
                SymbolLookup: {
                  indexKind: "registeredAssets",
                  key: "Item",
                },
              },
            },
          ],
          Schema: {
            ObjectiveIds: "ObjectiveIds",
            Type: "ObjectiveLineAsset",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(workspaceDir, "AnimationPreviewField.json"),
      JSON.stringify(
        {
          Id: "AnimationPreviewField",
          Title: "Animation Preview Field",
          Color: "#123456",
          Content: [
            {
              Id: "Animation",
              Type: "SmallString",
              Options: {
                Label: "Animation",
                AnimationAutocompleteKind: "appearance-model",
              },
            },
          ],
          Schema: {
            Animation: "Animation",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(workspaceDir, "TupleField.json"),
      JSON.stringify(
        {
          Id: "TupleField",
          Title: "Tuple Field",
          Color: "#123456",
          Content: [
            {
              Id: "Range",
              Type: "Tuple",
              Options: {
                Label: "Range",
                Default: [1, 2],
                TupleSize: 2,
                TupleItemType: "Float",
              },
            },
          ],
          Schema: {
            Range: "Range",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(workspaceDir, "UniqueListField.json"),
      JSON.stringify(
        {
          Id: "UniqueListField",
          Title: "Unique List Field",
          Color: "#123456",
          Content: [
            {
              Id: "Values",
              Type: "List",
              Options: {
                Label: "Values",
                UniqueItems: true,
                Values: ["One", "Two"],
              },
            },
          ],
          Schema: {
            Values: "Values",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(supplementsDir, "TestWorkspace.json"),
      JSON.stringify(
        {
          SchemaListFallback: {
            $ref: "ObjectiveLineAsset.json#",
          },
          SchemaStringFallback: {
            $ref: "EntityEffect.json#",
          },
          ExplicitSymbolLookup: {
            $ref: "ObjectiveLineAsset.json#",
          },
        },
        null,
        2,
      ),
    );

    const schemaRuntime = new SchemaRuntime(schemaDir, logger);
    const workspaceRuntime = new WorkspaceRuntime(workspacesDir, schemaRuntime, logger, supplementsDir);
    const workspace = workspaceRuntime.nodeEditorWorkspaces["Test Workspace"];
    if (!workspace) {
      throw new Error("Expected test workspace to load.");
    }

    expect(
      workspace.nodeTemplatesById.SchemaListFallback.fieldsBySchemaKey.ObjectiveIds.symbolLookup,
    ).toEqual({
      indexKind: "registeredAssets",
      key: "ObjectiveAsset",
    });

    expect(
      workspace.nodeTemplatesById.SchemaStringFallback.fieldsBySchemaKey.WorldRemovalSoundEventId
        .symbolLookup,
    ).toEqual({
      indexKind: "registeredAssets",
      key: "SoundEvent",
    });

    expect(
      workspace.nodeTemplatesById.ExplicitSymbolLookup.fieldsBySchemaKey.ObjectiveIds.symbolLookup,
    ).toEqual({
      indexKind: "registeredAssets",
      key: "Item",
    });

    expect(
      workspace.nodeTemplatesById.AnimationPreviewField.fieldsBySchemaKey.Animation,
    ).toMatchObject({
      animationAutocompleteKind: "appearance-model",
      previewFeatureKind: "animation",
    });

    expect(workspace.nodeTemplatesById.TupleField.fieldsBySchemaKey.Range).toMatchObject({
      type: "tuple",
      tupleSize: 2,
      tupleItemType: "float",
      defaultValue: [1, 2],
      isSet: false,
    });

    expect(workspace.nodeTemplatesById.UniqueListField.fieldsBySchemaKey.Values).toMatchObject({
      type: "list",
      uniqueItems: true,
      overrideAutocompleteValues: ["One", "Two"],
      isSet: false,
    });
  });

  test("filters the StateTransitions root context and hydrates unset defaults", () => {
    const schemaRuntime = new SchemaRuntime(schemaDir, logger);
    const workspaceRuntime = new WorkspaceRuntime(workspacesRootPath, schemaRuntime, logger);

    const context = workspaceRuntime.resolveWorkspaceContextByWorkspaceRoot(
      "NPC Behavior",
      "StateTransitions",
    );

    expect(context).not.toBeNull();
    expect(context?.rootTemplateOrVariantId).toBe("Structural.StateTransitionListRoot");
    expect(Object.keys(context?.templateCategories ?? {}).sort()).toEqual([
      "Actions",
      "State Transitions",
    ]);
    expect(context?.templateCategories.Actions).toContain("Action.Timeout");
    expect(context?.templateCategories["State Transitions"]).toEqual([
      "Structural.StateTransitionNode",
      "Structural.StateTransitionMappingNode",
    ]);
    expect(context?.templateCategories.Sensors).toBeUndefined();

    expect(context?.nodeTemplatesById["Structural.StateTransitionNode"].fieldsBySchemaKey.Enabled).toMatchObject({
      defaultValue: true,
      isSet: false,
      computable: true,
    });
    expect(
      context?.nodeTemplatesById["Structural.StateTransitionMappingNode"].fieldsBySchemaKey.Priority,
    ).toMatchObject({
      defaultValue: 0,
      isSet: false,
    });
    expect(
      context?.nodeTemplatesById["Structural.StateTransitionMappingNode"].fieldsBySchemaKey.Enabled,
    ).toMatchObject({
      defaultValue: true,
      isSet: false,
      computable: true,
    });
  });
});
