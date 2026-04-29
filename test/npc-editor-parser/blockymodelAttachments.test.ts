import { describe, expect, it } from "vitest";
import {
  buildCompositeBlockymodelScene,
} from "../../webview/shared/blockymodel/buildCompositeBlockymodelScene";
import type {
  BlockymodelFile,
  BlockymodelNode,
} from "../../webview/shared/blockymodel/blockymodelTypes";

describe("shared blockymodel attachment composition", () => {
  it("snaps piece roots to the host mesh socket and suppresses piece child offset inheritance", () => {
    const scene = buildCompositeBlockymodelScene(
      createModel([
        createBoxNode("Head", {
          shapeOffset: { x: 4, y: 5, z: 6 },
        }),
      ]),
      undefined,
      [
        {
          model: createModel([
            createBoxNode("Head", {
              isPiece: true,
              shapeOffset: { x: 10, y: 20, z: 30 },
              children: [
                createNode("Hat", {
                  position: { x: 1, y: 2, z: 3 },
                }),
              ],
            }),
          ]),
        },
      ],
    );

    const hostHead = scene.animationRig.bindingsByName.get("Head")?.[0];
    const attachmentHead = scene.attachments[0]?.animationRig.bindingsByName.get("Head")?.[0];
    const hatBinding = scene.attachments[0]?.animationRig.bindingsByName.get("Hat")?.[0];

    expect(hostHead).toBeDefined();
    expect(attachmentHead).toBeDefined();
    expect(hostHead?.isPiece).toBe(false);
    expect(attachmentHead?.isPiece).toBe(true);
    expect(attachmentHead?.pivot.parent).toBe(hostHead?.pivot);
    expect(hostHead?.mesh?.position.toArray()).toEqual([4, 5, 6]);
    expect(attachmentHead?.pivot.position.toArray()).toEqual([4, 5, 6]);
    expect(attachmentHead?.basePosition.toArray()).toEqual([4, 5, 6]);
    expect(attachmentHead?.pivot.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(attachmentHead?.baseQuaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(hatBinding?.pivot.parent).toBe(attachmentHead?.pivot);
    expect(hatBinding?.pivot.position.toArray()).toEqual([1, 2, 3]);
  });
});

function createModel(nodes: BlockymodelNode[]): BlockymodelFile {
  return { nodes };
}

function createNode(
  name: string,
  {
    isPiece = false,
    position = { x: 0, y: 0, z: 0 },
    children = [],
  }: {
    isPiece?: boolean;
    position?: { x: number; y: number; z: number };
    children?: BlockymodelNode[];
  } = {},
): BlockymodelNode {
  return {
    id: name,
    name,
    position,
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    shape: {
      type: "none",
      offset: { x: 0, y: 0, z: 0 },
      stretch: { x: 1, y: 1, z: 1 },
      textureLayout: {},
      settings: isPiece ? { isPiece: true } : {},
      unwrapMode: "custom",
      visible: true,
      doubleSided: false,
      shadingMode: "standard",
    },
    children,
  };
}

function createBoxNode(
  name: string,
  {
    isPiece = false,
    shapeOffset = { x: 0, y: 0, z: 0 },
    children = [],
  }: {
    isPiece?: boolean;
    shapeOffset?: { x: number; y: number; z: number };
    children?: BlockymodelNode[];
  } = {},
): BlockymodelNode {
  return {
    id: name,
    name,
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    shape: {
      type: "box",
      offset: shapeOffset,
      stretch: { x: 1, y: 1, z: 1 },
      textureLayout: {},
      settings: {
        size: { x: 1, y: 1, z: 1 },
        ...(isPiece ? { isPiece: true } : {}),
      },
      unwrapMode: "custom",
      visible: true,
      doubleSided: false,
      shadingMode: "standard",
    },
    children,
  };
}
