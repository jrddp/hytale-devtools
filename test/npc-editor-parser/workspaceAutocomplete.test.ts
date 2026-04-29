import { describe, expect, test } from "vitest";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import { Workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";
import { parseNpcDocumentText } from "../../webview/hytale-npc-role-editor/src/parsing/parseNpcDocument";

describe("npc workspace autocomplete enrichment", () => {
  const descriptors: NpcDescriptorDocument = [
    {
      Name: "Generic",
      Category: "Role",
      Attributes: [
        {
          Name: "Appearance",
          Type: "Asset",
          Domain: "Model",
          Computable: true,
        },
      ],
    },
  ];

  test("hydrates cached reference parameters with role-attribute autocomplete metadata", () => {
    const workspace = createWorkspace();
    workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Variant",
        Reference: "Template_Base",
      }),
      version: 1,
    });

    workspace.setVariantReferenceState({
      status: "loaded",
      referenceName: "Template_Base",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: {
          Compute: "Appearance",
        },
        Parameters: {
          Appearance: {
            Value: "Sheep",
          },
        },
      }),
    });

    const inheritedAppearanceField = workspace.variantReferenceParameters.find(
      field => field.key === "Appearance",
    );

    expect(inheritedAppearanceField?.symbolRef).toEqual({
      indexKind: "registeredAssets",
      key: "ModelAsset",
    });

    expect(workspace.addVariantModifyOverride("Appearance")).toBe(true);

    const modifySection = workspace.propertySections.find(section => section.id === "modify");
    const modifyAppearanceField = modifySection?.fields.find(field => field.key === "Appearance");

    expect(modifyAppearanceField?.symbolRef).toEqual({
      indexKind: "registeredAssets",
      key: "ModelAsset",
    });
  });

  test("lists and adds optional descriptor-backed role attributes", () => {
    const workspace = createWorkspace();
    workspace.setDescriptors({
      descriptors: [
        {
          Name: "Generic",
          Category: "Role",
          Attributes: [
            {
              Name: "Appearance",
              Type: "Asset",
              Domain: "Model",
            },
            {
              Name: "DropDeathItemsInstantly",
              Type: "Boolean",
              DefaultValue: "true",
            },
            {
              Name: "StartState",
              Type: "String",
              Required: "REQUIRED",
            },
          ],
        },
      ],
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
      }),
      version: 1,
    });

    expect(workspace.getAvailableRoleAttributeFields()).toMatchObject([
      {
        key: "Appearance",
        symbolRef: {
          indexKind: "registeredAssets",
          key: "ModelAsset",
        },
      },
      {
        key: "DropDeathItemsInstantly",
        kind: "boolean",
        value: {
          kind: "literal",
          value: true,
        },
      },
    ]);
    expect(workspace.getAvailableRoleAttributeFields().some(field => field.key === "StartState")).toBe(
      false,
    );

    expect(workspace.addRoleAttribute("DropDeathItemsInstantly")).toBe(true);

    const roleAttributesSection = workspace.propertySections.find(section => section.id === "roleAttributes");
    expect(roleAttributesSection?.fields.find(field => field.key === "DropDeathItemsInstantly")).toMatchObject({
      kind: "boolean",
      value: {
        kind: "literal",
        value: true,
      },
      isSet: true,
    });
    expect(workspace.getAvailableRoleAttributeFields().some(field => field.key === "DropDeathItemsInstantly")).toBe(
      false,
    );

    const reparsed = parseNpcDocumentText(workspace.documentText ?? "");
    expect(reparsed.status).toBe("ready");
    expect(reparsed.status === "ready" ? reparsed.document.DropDeathItemsInstantly : undefined).toBe(true);
  });

  test("unsetting an optional role attribute removes it from the section and restores it to the add menu", () => {
    const workspace = createWorkspace();
    workspace.setDescriptors({
      descriptors: [
        {
          Name: "Generic",
          Category: "Role",
          Attributes: [
            {
              Name: "DropDeathItemsInstantly",
              Type: "Boolean",
              DefaultValue: "true",
            },
          ],
        },
      ],
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
      }),
      version: 1,
    });

    expect(workspace.addRoleAttribute("DropDeathItemsInstantly")).toBe(true);
    expect(workspace.unsetField("DropDeathItemsInstantly")).toBe(true);

    const roleAttributesSection = workspace.propertySections.find(section => section.id === "roleAttributes");
    expect(roleAttributesSection?.fields.some(field => field.key === "DropDeathItemsInstantly")).toBe(false);
    expect(workspace.getAvailableRoleAttributeFields().some(field => field.key === "DropDeathItemsInstantly")).toBe(
      true,
    );

    const reparsed = parseNpcDocumentText(workspace.documentText ?? "");
    expect(reparsed.status).toBe("ready");
    expect(
      reparsed.status === "ready"
        ? Object.prototype.hasOwnProperty.call(reparsed.document, "DropDeathItemsInstantly")
        : true,
    ).toBe(false);
  });

  test("appends added optional role attributes after required entries and preserves their relative order", () => {
    const workspace = createWorkspace();
    workspace.setDescriptors({
      descriptors: [
        {
          Name: "Generic",
          Category: "Role",
          Attributes: [
            {
              Name: "StartState",
              Type: "String",
              Required: "REQUIRED",
            },
            {
              Name: "Appearance",
              Type: "Asset",
              Domain: "Model",
            },
            {
              Name: "DropDeathItemsInstantly",
              Type: "Boolean",
              DefaultValue: "true",
            },
          ],
        },
      ],
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
      }),
      version: 1,
    });

    expect(workspace.addRoleAttribute("Appearance")).toBe(true);
    expect(workspace.addRoleAttribute("DropDeathItemsInstantly")).toBe(true);

    const roleAttributesSection = workspace.propertySections.find(section => section.id === "roleAttributes");
    expect(roleAttributesSection?.fields.map(field => field.key)).toEqual([
      "StartState",
      "Appearance",
      "DropDeathItemsInstantly",
    ]);

    const reparsed = parseNpcDocumentText(workspace.documentText ?? "");
    expect(reparsed.status).toBe("ready");
    expect(reparsed.status === "ready" ? reparsed.topLevelKeyOrder : []).toEqual([
      "Type",
      "Appearance",
      "DropDeathItemsInstantly",
    ]);
  });
});

function createWorkspace(): Workspace {
  const workspace = new Workspace();
  workspace.vscode = {
    postMessage() {},
  } as never;
  return workspace;
}
