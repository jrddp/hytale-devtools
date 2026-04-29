export type NpcDescriptorAttribute = {
  Name: string;
  Type: string;
  Required?: string | null;
  Computable?: boolean | null;
  State?: string | null;
  ShortDescription?: string | null;
  LongDescription?: string | null;
  DefaultValue?: string | null;
  Domain?: unknown;
  MinSize?: number | null;
  MaxSize?: number | null;
  Validator?: unknown;
  FlagDescriptions?: unknown;
};

export type NpcDescriptor = {
  Name: string;
  Category: string;
  State?: string | null;
  ShortDescription?: string | null;
  LongDescription?: string | null;
  Attributes?: NpcDescriptorAttribute[] | null;
  Validators?: unknown;
  ProviderEvaluators?: unknown;
  Tags?: string[] | null;
};

export type NpcDescriptorDocument = NpcDescriptor[];

export type NpcDescriptorSource = "companion-export" | "default-data";
