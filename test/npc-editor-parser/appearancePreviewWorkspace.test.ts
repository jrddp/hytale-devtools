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

  test("base preview results seed idle animation and compose the visible preview", () => {
    const workspace = createWorkspace();
    const model = { name: "SheepModel" };
    const attachments = [{ model: { name: "Horns" } }];
    const idleAnimation = {
      animation: {
        formatVersion: 1,
        duration: 20,
        holdLastKeyframe: false,
        nodeAnimations: {},
      },
      animationSpeed: 1,
      animationLooping: true,
    };

    workspace.beginAppearanceBasePreviewLoad("Sheep");
    workspace.setAppearanceBasePreviewResult({
      assetName: "Sheep",
      basePreview: {
        type: "Model",
        model,
        texture: [1, 2, 3],
        attachments,
      },
      animationIds: ["Wake", "Idle"],
      idleAnimationPreview: idleAnimation,
    });

    expect(workspace.appearanceAnimationIds).toEqual(["Idle", "Wake"]);
    expect(workspace.getAppearanceAnimationPreview("Sheep", "Idle")).toEqual(idleAnimation);
    expect(workspace.appearancePreview).toEqual({
      type: "Model",
      model,
      texture: [1, 2, 3],
      attachments,
      ...idleAnimation,
    });
  });

  test("cached animation swaps preserve base model references and can return to idle immediately", () => {
    const workspace = createWorkspace();
    const model = { name: "SheepModel" };
    const attachments = [{ model: { name: "Horns" } }];
    const idleAnimation = {
      animation: {
        formatVersion: 1,
        duration: 20,
        holdLastKeyframe: false,
        nodeAnimations: {},
      },
      animationSpeed: 1,
      animationLooping: true,
    };
    const wakeAnimation = {
      animation: {
        formatVersion: 1,
        duration: 10,
        holdLastKeyframe: true,
        nodeAnimations: {
          Root: [],
        },
      },
      animationSpeed: 2,
      animationLooping: false,
    };

    workspace.beginAppearanceBasePreviewLoad("Sheep");
    workspace.setAppearanceBasePreviewResult({
      assetName: "Sheep",
      basePreview: {
        type: "Model",
        model,
        attachments,
      },
      animationIds: ["Wake", "Idle"],
      idleAnimationPreview: idleAnimation,
    });
    const idlePreview = workspace.appearancePreview;

    workspace.setAppearanceAnimationPreviewResult({
      assetName: "Sheep",
      animationSetId: "Wake",
      animationPreview: wakeAnimation,
    });
    expect(workspace.showAppearanceAnimationPreview("Sheep", "Wake")).toBe(true);

    const wakePreview = workspace.appearancePreview;
    expect(wakePreview?.type).toBe("Model");
    expect(wakePreview?.type === "Model" ? wakePreview.model : undefined).toBe(
      idlePreview?.type === "Model" ? idlePreview.model : undefined,
    );
    expect(wakePreview?.type === "Model" ? wakePreview.attachments : undefined).toBe(
      idlePreview?.type === "Model" ? idlePreview.attachments : undefined,
    );
    expect(wakePreview?.type === "Model" ? wakePreview.animation : undefined).toEqual(
      wakeAnimation.animation,
    );

    expect(workspace.showAppearanceAnimationPreview("Sheep", "Idle")).toBe(true);
    expect(workspace.appearancePreview).toEqual(idlePreview);
  });

  test("missing cached animations leave the base preview static", () => {
    const workspace = createWorkspace();
    const model = { name: "SheepModel" };
    const idleAnimation = {
      animation: {
        formatVersion: 1,
        duration: 20,
        holdLastKeyframe: false,
        nodeAnimations: {},
      },
      animationSpeed: 1,
      animationLooping: true,
    };

    workspace.beginAppearanceBasePreviewLoad("Sheep");
    workspace.setAppearanceBasePreviewResult({
      assetName: "Sheep",
      basePreview: {
        type: "Model",
        model,
      },
      animationIds: ["Idle"],
      idleAnimationPreview: idleAnimation,
    });
    workspace.setAppearanceAnimationPreviewResult({
      assetName: "Sheep",
      animationSetId: "Wake",
      animationPreview: undefined,
    });

    expect(workspace.showAppearanceAnimationPreview("Sheep", "Wake")).toBe(true);
    expect(workspace.appearancePreview).toEqual({
      type: "Model",
      model,
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
