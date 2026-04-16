import * as THREE from "../../webview/shared/node_modules/three/build/three.module.js";
import { describe, expect, it } from "vitest";
import {
  createAnimationBinding,
  createAnimationRig,
  registerAnimationBinding,
} from "../../webview/shared/blockymodel/animationRig";
import { createBlockyanimController } from "../../webview/shared/blockymodel/blockyanimPlayer";
import { parseBlockyanimFile } from "../../webview/shared/blockymodel/parseBlockyanim";

describe("shared blockyanim support", () => {
  it("parses blockyanim files and sorts channel keyframes", () => {
    const parsed = parseBlockyanimFile({
      formatVersion: 1,
      duration: 60,
      holdLastKeyframe: false,
      nodeAnimations: {
        Root: {
          position: [
            {
              time: 60,
              delta: { x: 6, y: 0, z: 0 },
              interpolationType: "linear",
            },
            {
              time: 0,
              delta: { x: 0, y: 0, z: 0 },
              interpolationType: "linear",
            },
          ],
        },
      },
    });

    expect(parsed.duration).toBe(60);
    expect(parsed.nodeAnimations.Root.position?.map(keyframe => keyframe.time)).toEqual([0, 60]);
  });

  it("applies interpolated poses onto a built animation rig", () => {
    const pivot = new THREE.Object3D();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0,
          1, 0,
          1, 1,
        ]),
        2,
      ),
    );
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    pivot.add(mesh);

    const rig = createAnimationRig({ width: 16, height: 16 });
    registerAnimationBinding(rig, createAnimationBinding("Root", pivot, mesh));

    const controller = createBlockyanimController(
      rig,
    );

    controller.setAnimation(
      parseBlockyanimFile({
        formatVersion: 1,
        duration: 60,
        holdLastKeyframe: false,
        nodeAnimations: {
          Root: {
            position: [
              {
                time: 0,
                delta: { x: 0, y: 0, z: 0 },
                interpolationType: "linear",
              },
              {
                time: 60,
                delta: { x: 6, y: 0, z: 0 },
                interpolationType: "linear",
              },
            ],
            shapeVisible: [
              {
                time: 0,
                delta: false,
              },
            ],
            shapeUvOffset: [
              {
                time: 0,
                delta: { x: 2, y: 0 },
              },
            ],
          },
        },
      }),
    );

    controller.update(0.5);

    expect(pivot.position.x).toBeCloseTo(3, 5);
    expect(mesh.visible).toBe(false);

    const uv = mesh.geometry.getAttribute("uv");
    expect(uv.array[0]).toBeCloseTo(0.125, 5);
  });

  it("applies playback speed and looping overrides", () => {
    const pivot = new THREE.Object3D();
    const rig = createAnimationRig({ width: 16, height: 16 });
    registerAnimationBinding(rig, createAnimationBinding("Root", pivot));

    const animation = parseBlockyanimFile({
      formatVersion: 1,
      duration: 60,
      holdLastKeyframe: false,
      nodeAnimations: {
        Root: {
          position: [
            {
              time: 0,
              delta: { x: 0, y: 0, z: 0 },
              interpolationType: "linear",
            },
            {
              time: 60,
              delta: { x: 6, y: 0, z: 0 },
              interpolationType: "linear",
            },
          ],
        },
      },
    });
    const controller = createBlockyanimController(rig);
    controller.setAnimation(animation);
    controller.setPlaybackRate(2);
    controller.update(0.25);

    expect(pivot.position.x).toBeCloseTo(3, 5);

    controller.setLoopingOverride(false);
    controller.update(1);

    expect(pivot.position.x).toBeCloseTo(6, 5);
  });
});
