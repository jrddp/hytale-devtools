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
    expect(afterParent).not.toBe(beforeParent);
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

describe("asset editor workspace document updates", () => {
  test("does not reparse unchanged document updates", () => {
    const workspace = new Workspace();
    const definition = assetDefinition(
      objectField(null, {
        Name: stringField("Name"),
      }),
    );

    workspace.assetsByRef = {};
    workspace.setAssetDefinition(definition);
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 1,
    });

    const root = workspace.documentRootField as ObjectFieldInstance;
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 2,
    });

    expect(workspace.documentRootField).toBe(root);
    expect(workspace.documentVersion).toBe(2);
  });

  test("does not reparse the extension echo for an edit applied by the webview", () => {
    const workspace = new Workspace();
    const definition = assetDefinition(
      objectField(null, {
        Name: stringField("Name"),
      }),
    );
    const postedMessages: unknown[] = [];

    workspace.vscode = {
      postMessage: message => {
        postedMessages.push(message);
      },
    };
    workspace.assetsByRef = {};
    workspace.setAssetDefinition(definition);
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 1,
    });

    const root = workspace.documentRootField as ObjectFieldInstance;
    (root.properties.Name as StringFieldInstance).value = "Edited";
    workspace.applyDocumentState();

    expect(postedMessages).toHaveLength(1);
    const appliedMessage = postedMessages[0] as { text: string };

    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: appliedMessage.text,
      version: 2,
    });

    expect(workspace.documentRootField).toBe(root);
    expect(workspace.documentText).toBe(appliedMessage.text);
    expect(workspace.documentVersion).toBe(2);
  });

  test("defers parent reparses while an action has only local UI state", () => {
    const workspace = new Workspace();
    const definition = assetDefinition(
      objectField(null, {
        Name: stringField("Name", { inheritsValue: true }),
      }),
    );
    const postedMessages: unknown[] = [];

    workspace.vscode = {
      postMessage: message => {
        postedMessages.push(message);
      },
    };
    workspace.assetsByRef = {};
    workspace.setAssetDefinition(definition);
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 1,
    });

    const root = workspace.documentRootField as ObjectFieldInstance;
    workspace.applyDocumentState({ preserveUnserializedStateOnNoop: true });
    workspace.setParentState(
      loadedParent({
        Name: "Inherited Name",
      }),
    );

    expect(postedMessages).toHaveLength(0);
    expect(workspace.documentRootField).toBe(root);
  });

  test("still reparses document updates that do not match a webview-applied edit", () => {
    const workspace = new Workspace();
    const definition = assetDefinition(
      objectField(null, {
        Name: stringField("Name"),
      }),
    );
    const postedMessages: unknown[] = [];

    workspace.vscode = {
      postMessage: message => {
        postedMessages.push(message);
      },
    };
    workspace.assetsByRef = {};
    workspace.setAssetDefinition(definition);
    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: "{}",
      version: 1,
    });

    const root = workspace.documentRootField as ObjectFieldInstance;
    (root.properties.Name as StringFieldInstance).value = "Edited";
    workspace.applyDocumentState();

    workspace.setDocument({
      documentPath: "/tmp/TestAsset.json",
      text: JSON.stringify({ Name: "External" }, null, "\t"),
      version: 2,
    });

    const reparsedRoot = workspace.documentRootField as ObjectFieldInstance;
    expect(reparsedRoot).not.toBe(root);
    expect((reparsedRoot.properties.Name as StringFieldInstance).value).toBe("External");
  });
});
