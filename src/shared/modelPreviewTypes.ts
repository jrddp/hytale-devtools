export type ResolvedModelPreviewAttachment = {
  model?: Record<string, unknown>;
  texture?: number[];
};

export type ResolvedModelPreview = {
  type: "Model";
  model?: Record<string, unknown>;
  texture?: number[];
  attachments?: ResolvedModelPreviewAttachment[];
  animation?: Record<string, unknown>;
  animationSpeed?: number;
  animationLooping?: boolean;
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
