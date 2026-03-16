import type { Field } from "@shared/fieldTypes";

type RuntimeState = {
  // used to persist empty values like [] or {} when parsed
  isPresent?: boolean;
  value?: unknown;
  unparsedData?: unknown;
  parsedItems?: (FieldInstance | FieldInstance[])[];
  entries?: { key: string; valueField: FieldInstance }[];
  selectedIdentity?: string;
  activeVariantField?: ObjectFieldInstance | null;
  resolvedField?: FieldInstance | null;
  mode?: "string" | "inline" | "empty";
  stringValue?: string;
  inlineValueField?: FieldInstance | null;
  properties?: Record<string, FieldInstance>;
  items?: FieldInstance | FieldInstance[];
  valueField?: FieldInstance;
  identityField?: StringFieldInstance & { schemaKey: string };
  variantsByIdentity?: Record<string, ObjectFieldInstance>;
  stringField?: StringFieldInstance;
  inlineField?: FieldInstance;
  unmappedFields?: FieldInstance[];
};

export type FieldInstance = Field & RuntimeState;
export type RootFieldInstance = FieldInstance & { type: "object" | "variant" };
export type StringFieldInstance = FieldInstance & { type: "string"; value?: string };
export type NumberFieldInstance = FieldInstance & { type: "number"; value?: number };
export type BooleanFieldInstance = FieldInstance & { type: "boolean"; value?: boolean };
export type ColorFieldInstance = FieldInstance & { type: "color"; value?: string };
export type ObjectFieldInstance = FieldInstance & { type: "object"; properties: Record<string, FieldInstance> };
export type ArrayFieldInstance = FieldInstance & {
  type: "array";
  items: FieldInstance | FieldInstance[];
  parsedItems: (FieldInstance | FieldInstance[])[];
};
export type MapFieldInstance = FieldInstance & {
  type: "map";
  valueField: FieldInstance;
  entries: { key: string; valueField: FieldInstance }[];
};
export type VariantFieldInstance = FieldInstance & {
  type: "variant";
  identityField: StringFieldInstance & { schemaKey: string };
  variantsByIdentity: Record<string, ObjectFieldInstance>;
  activeVariantField?: ObjectFieldInstance | null;
};
export type RefFieldInstance = FieldInstance & { type: "ref"; resolvedField?: FieldInstance | null };
export type InlineOrReferenceFieldInstance = FieldInstance & {
  type: "inlineOrReference";
  stringField: StringFieldInstance;
  inlineField: FieldInstance;
  mode: "string" | "inline" | "empty";
  inlineValueField?: FieldInstance | null;
};
export type RawJsonFieldInstance = FieldInstance & { type: "rawJson" };
export type TimelineFieldInstance = FieldInstance & { type: "timeline" };
export type WeightedTimelineFieldInstance = FieldInstance & { type: "weightedTimeline" };
