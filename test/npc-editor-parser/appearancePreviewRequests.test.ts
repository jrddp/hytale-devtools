import { describe, expect, test } from "vitest";
import type { NpcRoleEditorWebviewToExtensionMessage } from "../../src/shared/npc-role-editor/messageTypes";
import {
  isAppearancePreviewAnimationUpdateCurrent,
  isAppearancePreviewBaseUpdateCurrent,
  requestAppearancePreviewBase,
  syncAppearancePreviewAnimationRequest,
  type AppearancePreviewAnimationRequestState,
} from "../../webview/hytale-npc-role-editor/src/appearancePreviewRequests";

describe("npc appearance preview request helpers", () => {
  test("requests base previews for the current appearance asset", () => {
    const messages: NpcRoleEditorWebviewToExtensionMessage[] = [];

    requestAppearancePreviewBase(
      {
        postMessage(message: NpcRoleEditorWebviewToExtensionMessage) {
          messages.push(message);
        },
      },
      "Sheep",
    );

    expect(messages).toEqual([
      {
        type: "resolveAppearancePreviewBase",
        assetName: "Sheep",
      },
    ]);
  });

  test("dedupes repeated animation preview requests for the same asset and animation", () => {
    const messages: NpcRoleEditorWebviewToExtensionMessage[] = [];
    let lastRequested: AppearancePreviewAnimationRequestState | null = null;

    const vscode = {
      postMessage(message: NpcRoleEditorWebviewToExtensionMessage) {
        messages.push(message);
      },
    };

    lastRequested = syncAppearancePreviewAnimationRequest({
      assetName: "Sheep",
      animationSetId: "Wake",
      lastRequestedRequest: lastRequested,
      vscode,
    });
    lastRequested = syncAppearancePreviewAnimationRequest({
      assetName: "Sheep",
      animationSetId: "Wake",
      lastRequestedRequest: lastRequested,
      vscode,
    });
    lastRequested = syncAppearancePreviewAnimationRequest({
      assetName: "Sheep",
      animationSetId: "Alerted",
      lastRequestedRequest: lastRequested,
      vscode,
    });

    expect(messages).toEqual([
      {
        type: "resolveAppearancePreviewAnimation",
        assetName: "Sheep",
        animationSetId: "Wake",
      },
      {
        type: "resolveAppearancePreviewAnimation",
        assetName: "Sheep",
        animationSetId: "Alerted",
      },
    ]);
  });

  test("matches base preview updates by asset name", () => {
    expect(
      isAppearancePreviewBaseUpdateCurrent({
        assetName: "Sheep",
        currentAssetName: "Sheep",
      }),
    ).toBe(true);
    expect(
      isAppearancePreviewBaseUpdateCurrent({
        assetName: "Cow",
        currentAssetName: "Sheep",
      }),
    ).toBe(false);
  });

  test("matches animation preview updates by asset and animation id", () => {
    expect(
      isAppearancePreviewAnimationUpdateCurrent({
        assetName: "Sheep",
        animationSetId: "Wake",
        currentAssetName: "Sheep",
        currentAnimationSetId: "Wake",
      }),
    ).toBe(true);
    expect(
      isAppearancePreviewAnimationUpdateCurrent({
        assetName: "Sheep",
        animationSetId: "Wake",
        currentAssetName: "Sheep",
        currentAnimationSetId: "Idle",
      }),
    ).toBe(false);
    expect(
      isAppearancePreviewAnimationUpdateCurrent({
        assetName: "Cow",
        animationSetId: "Wake",
        currentAssetName: "Sheep",
        currentAnimationSetId: "Wake",
      }),
    ).toBe(false);
  });
});
