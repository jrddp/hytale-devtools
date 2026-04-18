import { describe, expect, test } from "vitest";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import { Workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";

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
});

function createWorkspace(): Workspace {
  const workspace = new Workspace();
  workspace.vscode = {
    postMessage() {},
  } as never;
  return workspace;
}
