import { describe, expect, test } from "vitest";
import type {
  AssetDefinition,
  FieldBase,
  ObjectField,
  StringField,
} from "../../src/shared/fieldTypes";
import type { AssetEditorParentState } from "../../src/shared/asset-editor/messageTypes";
import type {
  ArrayFieldInstance,
  ObjectFieldInstance,
  StringFieldInstance,
} from "../../webview/hytale-asset-editor/src/parsing/fieldInstances";
import { Workspace } from "../../webview/hytale-asset-editor/src/workspace.svelte";

function baseField(schemaKey: string | null, type: FieldBase["type"]): FieldBase {
  return {
    schemaKey,
    type,
    section: "General",
    collapsedByDefault: false,
  };
}

function assetDefinition(rootField: ObjectField, title = "Test Asset"): AssetDefinition {
  return {
    title,
    rootField,
    buttons: [],
    refDependencies: new Set<string>(),
  };
}

function stringField(schemaKey: string, overrides: Partial<StringField> = {}): StringField {
  return {
    ...baseField(schemaKey, "string"),
    ...overrides,
  };
}

function objectField(
  schemaKey: string | null,
  properties: Record<string, StringField>,
): ObjectField {
  return {
    ...baseField(schemaKey, "object"),
    properties,
  };
}

function loadedParent(rawJson: Record<string, unknown>): AssetEditorParentState {
  return {
    status: "loaded",
    parentName: "ParentAsset",
    parentInstance: {
      name: "ParentAsset",
      type: "Test Asset",
      path: "Server/Item/Items/ParentAsset.json",
      package: "Hytale:Hytale",
      rawJson,
    },
  };
}

describe("asset editor workspace parent parsing", () => {
  test("reparses the document when parent data arrives after the document", () => {
    const workspace = new Workspace();
    const definition = assetDefinition(
      objectField(null, {
        Name: stringField("Name", { inheritsValue: true }),
      }),
    );

    workspace.assetsByRef = {};
    workspace.setAssetDefinition(definition);
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 1,
    });

    const beforeParent = workspace.documentRootField as ObjectFieldInstance;
    expect((beforeParent.properties.Name as StringFieldInstance).inheritedValue).toBeUndefined();

    workspace.setParentState(
      loadedParent({
        Name: "Inherited Name",
      }),
    );

    const afterParent = workspace.documentRootField as ObjectFieldInstance;
    expect((afterParent.properties.Name as StringFieldInstance).inheritedValue).toBe(
      "Inherited Name",
    );
  });

  test("workspace collection inheritance serializes correctly after a plain clone override", () => {
    const workspace = new Workspace();
    const definition = assetDefinition(
      {
        ...baseField(null, "object"),
        properties: {
          Tags: {
            ...baseField("Tags", "array"),
            items: stringField("Tag", { inheritsValue: true }),
          },
        },
      } as ObjectField,
    );

    workspace.assetsByRef = {};
    workspace.setAssetDefinition(definition);
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 1,
    });
    workspace.setParentState(
      loadedParent({
        Tags: ["Inherited"],
      }),
    );

    const root = workspace.documentRootField as ObjectFieldInstance;
    const tags = root.properties.Tags as ArrayFieldInstance;

    expect(tags.inheritedItems).toHaveLength(1);
    tags.items = structuredClone(tags.inheritedItems);

    expect(workspace.serializeDocument()).toEqual({
      Tags: ["Inherited"],
    });
  });
});
