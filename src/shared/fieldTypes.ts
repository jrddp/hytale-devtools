import { type IndexReference } from "./indexTypes";

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "array"
  | "object"
  | "map"
  | "inlineOrReference"
  | "variant"
  | "timeline"
  | "weightedTimeline"
  | "ref"
  | "rawJson";

export type Field =
  | StringField
  | NumberField
  | BooleanField
  | ColorField
  | ArrayField
  | ObjectField
  | MapField
  | InlineOrReferenceField
  | VariantField
  | TimelineField
  | WeightedTimelineField
  | RefField
  | RawJsonField;

export type FieldBase = {
  schemaKey: string | null;
  type: FieldType;
  section: "General" | string | null;
  markdownDescription?: string;
  title?: string;
  default?: any;
  width?: number;
  height?: number;
  suffix?: string;
  nullable?: boolean;
  collapsedByDefault?: boolean;
};

export type StringField = FieldBase & {
  type: "string";
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  enumVals?: string[];
  markdownEnumDescriptions?: string[];
  symbolRef?: IndexReference;
  definesSymbol?: IndexReference;
  isLocalizationKey?: boolean;
  localizationKeyTemplate?: string;
  const?: string;
  bannedValues?: string[];
};

export type NumberField = FieldBase & {
  type: "number";
  default?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  /** For sliders */
  step?: number;
  isInteger?: boolean;
  allowInfinity?: boolean;
  /** Values allowed that may be outside of typical range */
  constantExceptions?: number[];
  bannedValues?: number[];
};

export type BooleanField = FieldBase & {
  type: "boolean";
  default?: boolean;
};

export type ColorField = FieldBase & {
  type: "color";
  colorType: "Color" | "ColorAlpha" | "ColorShort";
};

export type ArrayField = FieldBase & {
  type: "array";
  /** If array, should be treated as a tuple. */
  items: Field | Field[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

export type ObjectField = FieldBase & {
  type: "object";
  properties: Record<string, Field>;
};

export type MapField = FieldBase & {
  type: "map";
  keyField: StringField;
  valueField: Field;
};

export type VariantField = FieldBase & {
  type: "variant";
  identityField: StringField & { schemaKey: string };
  variantsByIdentity: Record<string, ObjectField>;
  unmappedFields?: (RefField | ObjectField)[];
};

export type RawJsonField = FieldBase & {
  type: "rawJson";
};

export type TimelineField = FieldBase & {
  type: "timeline";
  // TODO: implement
};

export type WeightedTimelineField = FieldBase & {
  type: "weightedTimeline";
  // TODO: implement
};

export type RefField = FieldBase & {
  type: "ref";
  $ref: string;
};

export type InlineOrReferenceField = FieldBase & {
  type: "inlineOrReference";
  stringField: StringField;
  // starts as ref field, resolves to become object field
  inlineField: RefField | ObjectField;
};

export type ButtonTypes = "EquipItem" | "ResetModel" | "UseModel";

export type AssetDefinition = {
  title: string;
  rootField: ObjectField | VariantField;
  buttons: ButtonTypes[];
};
