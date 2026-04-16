export type ResolvedModelPreview = {
  type: "Model";
  model?: Record<string, unknown>;
  texture?: number[];
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
};
