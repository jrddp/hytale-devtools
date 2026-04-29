import { describe, expect, test } from "vitest";
import { resolveParsedPreviewAnimation } from "../../webview/shared/components/modelPreviewAnimation";

describe("model preview animation helper", () => {
  test("parses preview animation payloads", () => {
    const animation = resolveParsedPreviewAnimation({
      type: "Model",
      model: {},
      animation: {
        formatVersion: 1,
        duration: 60,
        holdLastKeyframe: false,
        nodeAnimations: {},
      },
    });

    expect(animation?.duration).toBe(60);
  });

  test("falls back to static preview when the animation payload is invalid", () => {
    const animation = resolveParsedPreviewAnimation({
      type: "Model",
      model: {},
      animation: {
        nope: true,
      },
    });

    expect(animation).toBeUndefined();
  });
});
