export type ResolvedModelPreviewAttachment = {
  model?: Record<string, unknown>;
  texture?: number[];
};

export type BaseModelPreviewState = {
  type: "Model";
  model?: Record<string, unknown>;
  texture?: number[];
  attachments?: ResolvedModelPreviewAttachment[];
};

export type AnimationPreviewState = {
  animation?: Record<string, unknown>;
  animationSpeed?: number;
  animationLooping?: boolean;
};

export type ResolvedModelPreview = BaseModelPreviewState & AnimationPreviewState & {
  loading?: boolean;
};

export type ModelPreviewState =
  | {
      type: "none";
      loading?: boolean;
    }
  | ResolvedModelPreview;

export type ModelPreviewRequest = {
  modelPath?: string;
  texturePath?: string;
  modelAsset?: Record<string, unknown>;
};
