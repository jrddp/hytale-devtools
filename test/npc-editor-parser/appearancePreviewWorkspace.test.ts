import { describe, expect, test } from "vitest";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import { Workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";

describe("npc workspace appearance preview integration", () => {
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

  test("resolves literal top-level appearance values", () => {
    const workspace = createWorkspace();
    workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: "Sheep",
      }),
      version: 1,
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("Sheep");
  });

  test("resolves direct-translation compute appearance values through literal parameters", () => {
    const workspace = createWorkspace();
    workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: { Compute: "Appearance" },
        Parameters: {
          Appearance: {
            Value: "Trork",
          },
        },
      }),
      version: 1,
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("Trork");
  });

  test("resolves literal variant modify appearance values", () => {
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
        Modify: {
          Appearance: "VariantSheep",
        },
      }),
      version: 1,
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("VariantSheep");
  });

  test("resolves direct-translation variant modify appearance through local parameters", () => {
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
        Modify: {
          Appearance: {
            Compute: "Appearance",
          },
        },
        Parameters: {
          Appearance: {
            Value: "VariantSheep",
          },
        },
      }),
      version: 1,
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("VariantSheep");
  });

  test("resolves inherited literal variant appearance values from the reference chain", () => {
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
      appearanceValue: "InheritedSheep",
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("InheritedSheep");
  });

  test("resolves inherited computed variant appearance values through local parameter overrides", () => {
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
        Parameters: {
          Appearance: {
            Value: "LocalSheep",
          },
        },
      }),
      version: 1,
    });
    workspace.setVariantReferenceState({
      status: "loaded",
      referenceName: "Template_Base",
      appearanceValue: {
        Compute: "Appearance",
      },
      effectiveParameters: {
        Appearance: "InheritedSheep",
      },
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("LocalSheep");
  });

  test("does not resolve inherited non-direct compute appearance values", () => {
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
      appearanceValue: {
        Compute: 'isEmpty("Appearance") ? "A" : "B"',
      },
      effectiveParameters: {
        Appearance: "InheritedSheep",
      },
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBeUndefined();
  });
});

function createWorkspace(): Workspace {
  const workspace = new Workspace();
  workspace.vscode = {
    postMessage() {},
  } as never;
  return workspace;
}
