import { describe, expect, test } from "vitest";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import type { ModelPreviewState } from "../../src/shared/modelPreviewTypes";
import type { NpcRoleEditorWebviewToExtensionMessage } from "../../src/shared/npc-role-editor/messageTypes";
import {
  isAppearancePreviewUpdateCurrent,
  syncAppearancePreviewRequest,
  type AppearancePreviewRequestState,
} from "../../webview/hytale-npc-role-editor/src/appearancePreviewRequests";
import { Workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";

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

describe("npc appearance preview request scheduling", () => {
  test("requests previews for literal variant modify appearance values", () => {
    const harness = createHarness();
    harness.workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    harness.workspace.setDocument({
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

    harness.sync();

    expect(harness.resolveAppearancePreviewRequests).toEqual([
      { assetName: "VariantSheep", animationSetId: undefined },
    ]);
    expect(harness.previewStates.at(-1)).toEqual({ type: "none", loading: true });
  });

  test("requests previews when inherited appearance arrives through reference updates", () => {
    const harness = createHarness();
    harness.workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    harness.workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Variant",
        Reference: "Template_Base",
      }),
      version: 1,
    });

    harness.sync();
    expect(harness.resolveAppearancePreviewRequests).toEqual([]);

    harness.workspace.setVariantReferenceState({
      status: "loaded",
      referenceName: "Template_Base",
      appearanceValue: "InheritedSheep",
    });
    harness.sync();

    expect(harness.resolveAppearancePreviewRequests).toEqual([
      { assetName: "InheritedSheep", animationSetId: undefined },
    ]);
  });

  test("local parameter edits update inherited compute appearance without another reference round-trip", () => {
    const harness = createHarness();
    harness.workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    harness.workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Variant",
        Reference: "Template_Base",
        Parameters: {
          Appearance: {
            Value: "LocalSheepA",
          },
        },
      }),
      version: 1,
    });
    harness.workspace.setVariantReferenceState({
      status: "loaded",
      referenceName: "Template_Base",
      appearanceValue: {
        Compute: "Appearance",
      },
      effectiveParameters: {
        Appearance: "InheritedSheep",
      },
    });

    harness.sync();
    harness.workspace.updateFieldValue("Parameters.Appearance.Value", "LocalSheepB");
    harness.sync();

    expect(harness.resolveAppearancePreviewRequests).toEqual([
      { assetName: "LocalSheepA", animationSetId: undefined },
      { assetName: "LocalSheepB", animationSetId: undefined },
    ]);
    expect(
      harness.postedMessages.filter(message => message.type === "resolveVariantReference"),
    ).toHaveLength(1);
  });

  test("does not re-request unchanged appearance assets", () => {
    const harness = createHarness();
    harness.workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    harness.workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: "Sheep",
      }),
      version: 1,
    });

    harness.sync();
    harness.sync();

    expect(harness.resolveAppearancePreviewRequests).toEqual([
      { assetName: "Sheep", animationSetId: undefined },
    ]);
  });

  test("re-requests when only the animation override changes", () => {
    const harness = createHarness();
    harness.workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    harness.workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: "Sheep",
      }),
      version: 1,
    });

    harness.sync();
    harness.workspace.setAppearancePreviewAnimationOverride("Wake");
    harness.sync();

    expect(harness.resolveAppearancePreviewRequests).toEqual([
      { assetName: "Sheep", animationSetId: undefined },
      { assetName: "Sheep", animationSetId: "Wake" },
    ]);
  });

  test("matches preview updates by both asset name and animation override", () => {
    const request: AppearancePreviewRequestState = {
      assetName: "Sheep",
      animationSetId: "Wake",
    };

    expect(
      isAppearancePreviewUpdateCurrent({
        assetName: "Sheep",
        animationSetId: "Wake",
        currentRequest: request,
      }),
    ).toBe(true);
    expect(
      isAppearancePreviewUpdateCurrent({
        assetName: "Sheep",
        animationSetId: undefined,
        currentRequest: request,
      }),
    ).toBe(false);
    expect(
      isAppearancePreviewUpdateCurrent({
        assetName: "Cow",
        animationSetId: "Wake",
        currentRequest: request,
      }),
    ).toBe(false);
  });
});

function createHarness() {
  const workspace = new Workspace();
  const postedMessages: NpcRoleEditorWebviewToExtensionMessage[] = [];
  const previewStates: Array<ModelPreviewState | undefined> = [];
  let lastRequestedRequest: AppearancePreviewRequestState | null = null;

  const vscode = {
    postMessage(message: NpcRoleEditorWebviewToExtensionMessage) {
      postedMessages.push(message);
    },
  };

  workspace.vscode = vscode as never;

  return {
    workspace,
    postedMessages,
    previewStates,
    get resolveAppearancePreviewRequests() {
      return postedMessages
        .filter(
          (
            message,
          ): message is Extract<
            NpcRoleEditorWebviewToExtensionMessage,
            { type: "resolveAppearancePreview" }
          > => message.type === "resolveAppearancePreview",
        )
        .map(message => ({
          assetName: message.assetName ?? undefined,
          animationSetId: message.animationSetId,
        }));
    },
    sync() {
      lastRequestedRequest = syncAppearancePreviewRequest({
        assetName: workspace.getEffectiveAppearanceAssetName() ?? null,
        animationSetId: workspace.appearancePreviewAnimationOverride,
        lastRequestedRequest,
        vscode,
        setPreview(preview) {
          previewStates.push(preview);
        },
      });
    },
  };
}
