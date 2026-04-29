import { Vector3, type Texture } from "three";
import type { BlockymodelFile } from "./blockymodelTypes";
import {
  buildBlockymodelScene,
  type BuiltBlockymodelScene,
} from "./buildBlockymodelObject";

export interface BlockymodelAttachmentSceneInput {
  model: BlockymodelFile;
  texture?: Texture;
}

export interface BuiltCompositeBlockymodelScene extends BuiltBlockymodelScene {
  attachments: BuiltBlockymodelScene[];
}

function resolveAttachmentHost(
  scene: BuiltBlockymodelScene,
  nodeName: string,
) {
  const candidates = scene.animationRig.bindingsByName.get(nodeName);
  if (!candidates?.length) {
    return undefined;
  }

  return candidates.find(candidate => !candidate.isPiece) ?? candidates[0];
}

function getAttachmentSocketOffset(
  binding: BuiltBlockymodelScene["animationRig"]["bindings"][number],
) {
  return binding.mesh?.position.clone() ?? new Vector3(0, 0, 0);
}

function attachPieceBindings(
  scene: BuiltBlockymodelScene,
  attachmentScene: BuiltBlockymodelScene,
): void {
  for (const binding of attachmentScene.animationRig.bindings) {
    if (!binding.isPiece) {
      continue;
    }

    const hostBinding = resolveAttachmentHost(scene, binding.nodeName);
    if (!hostBinding) {
      continue;
    }

    hostBinding.pivot.add(binding.pivot);
    const socketOffset = getAttachmentSocketOffset(hostBinding);
    binding.pivot.position.copy(socketOffset);
    binding.pivot.quaternion.identity();
    binding.basePosition.copy(socketOffset);
    binding.baseQuaternion.identity();
  }
}

export function buildCompositeBlockymodelScene(
  model: BlockymodelFile,
  texture?: Texture,
  attachments: BlockymodelAttachmentSceneInput[] = [],
): BuiltCompositeBlockymodelScene {
  const baseScene = buildBlockymodelScene(model, texture);
  const attachmentScenes: BuiltBlockymodelScene[] = [];

  for (const attachment of attachments) {
    const attachmentScene = buildBlockymodelScene(attachment.model, attachment.texture, {
      isAttachment: true,
    });
    baseScene.root.add(attachmentScene.root);
    attachPieceBindings(baseScene, attachmentScene);
    attachmentScenes.push(attachmentScene);
  }

  return {
    ...baseScene,
    attachments: attachmentScenes,
  };
}
