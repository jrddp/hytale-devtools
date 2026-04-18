import { describe, expect, test } from "vitest";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import type { ModelPreviewState } from "../../src/shared/modelPreviewTypes";
import type { NpcRoleEditorWebviewToExtensionMessage } from "../../src/shared/npc-role-editor/messageTypes";
import { syncAppearancePreviewRequest } from "../../webview/hytale-npc-role-editor/src/appearancePreviewRequests";
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

    expect(harness.resolveAppearancePreviewRequests).toEqual(["VariantSheep"]);
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

    expect(harness.resolveAppearancePreviewRequests).toEqual(["InheritedSheep"]);
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

    expect(harness.resolveAppearancePreviewRequests).toEqual(["LocalSheepA", "LocalSheepB"]);
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

    expect(harness.resolveAppearancePreviewRequests).toEqual(["Sheep"]);
  });
});

function createHarness() {
  const workspace = new Workspace();
  const postedMessages: NpcRoleEditorWebviewToExtensionMessage[] = [];
  const previewStates: Array<ModelPreviewState | undefined> = [];
  let lastRequestedAssetName: string | null = null;

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
        .map(message => message.assetName ?? "");
    },
    sync() {
      lastRequestedAssetName = syncAppearancePreviewRequest({
        assetName: workspace.getEffectiveAppearanceAssetName() ?? null,
        lastRequestedAssetName,
        vscode,
        setPreview(preview) {
          previewStates.push(preview);
        },
      });
    },
  };
}
