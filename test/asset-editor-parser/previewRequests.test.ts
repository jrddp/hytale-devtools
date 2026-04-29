import { describe, expect, test } from "vitest";
import { buildPreviewRequest } from "../../webview/hytale-asset-editor/src/preview/previewRequests";

describe("asset preview request building", () => {
  test("builds ModelAsset preview requests from the serialized document so attachments can be resolved", () => {
    const request = buildPreviewRequest(
      "Model",
      "ModelAsset",
      null,
      {
        Model: "Common/Models/Base.blockymodel",
        Texture: "Common/Textures/Base.png",
        DefaultAttachments: [
          {
            Model: "Common/Attachments/Hat.blockymodel",
          },
        ],
      },
      {
        Model: "Common/Models/Override.blockymodel",
      },
    );

    expect(request).toEqual({
      type: "Model",
      modelAsset: {
        Model: "Common/Models/Override.blockymodel",
        Texture: "Common/Textures/Base.png",
        DefaultAttachments: [
          {
            Model: "Common/Attachments/Hat.blockymodel",
          },
        ],
      },
    });
  });

  test("keeps generic model preview requests path-based", () => {
    const request = buildPreviewRequest(
      "Model",
      "BlockType",
      {
        type: "object",
        fieldPath: "",
        displayMode: "collapsible",
        properties: {
          Model: {
            type: "string",
            fieldPath: "/Model",
            value: "Common/Models/Base.blockymodel",
          },
          Texture: {
            type: "string",
            fieldPath: "/Texture",
            value: undefined,
            inheritedValue: undefined,
          },
        },
      } as never,
      null,
    );

    expect(request).toEqual({
      type: "Model",
      modelPath: "Common/Models/Base.blockymodel",
      texturePath: "Common/Models/Base.png",
    });
  });
});
