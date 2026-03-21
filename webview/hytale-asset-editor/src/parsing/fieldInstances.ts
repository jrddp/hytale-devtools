import type {
  ArrayField,
  BooleanField,
  ColorField,
  Field,
  InlineOrReferenceField,
  MapField,
  NumberField,
  ObjectField,
  RawJsonField,
  StringField,
  TimelineField,
  VariantField,
  WeightedTimelineField,
} from "../../../../src/shared/fieldTypes";

export type FieldInstance =
  | StringFieldInstance
  | NumberFieldInstance
  | BooleanFieldInstance
  | ColorFieldInstance
  | ObjectFieldInstance
  | ArrayFieldInstance
  | MapFieldInstance
  | VariantFieldInstance
  | InlineOrReferenceFieldInstance
  | RawJsonFieldInstance
  | TimelineFieldInstance
  | WeightedTimelineFieldInstance;

export type ScalarFieldInstance =
  | StringFieldInstance
  | NumberFieldInstance
  | BooleanFieldInstance
  | ColorFieldInstance;

export type FieldInstanceBase = {
  readonly?: boolean;
  fieldPath: string;
};

export type StringFieldInstance = FieldInstanceBase &
  StringField & { value?: string; inheritedValue?: string };
export type NumberFieldInstance = FieldInstanceBase &
  NumberField & {
    value?: number | string;
    inheritedValue?: number | string;
  };
export type BooleanFieldInstance = FieldInstanceBase &
  BooleanField & { value?: boolean; inheritedValue?: boolean };
export type ColorFieldInstance = FieldInstanceBase &
  ColorField & { value?: string; inheritedValue?: string };

export type MapFieldInstance = FieldInstanceBase &
  MapField & {
    valueField: FieldInstance;
    entries: { key: string; valueField: FieldInstance }[];
    inheritedEntries: { key: string; valueField: FieldInstance }[];
  };

export type InlineOrReferenceFieldInstance = FieldInstanceBase &
  InlineOrReferenceField & {
    activeField: StringFieldInstance | ObjectFieldInstance;
    inheritedActiveField: StringFieldInstance | ObjectFieldInstance;
  };

export type RawJsonFieldInstance = FieldInstanceBase &
  RawJsonField & { value?: string; inheritedValue?: string };
export type TimelineFieldInstance = FieldInstanceBase &
  TimelineField & {
    unparsedData?: unknown;
    inheritedUnparsedData?: unknown;
  };
export type WeightedTimelineFieldInstance = FieldInstanceBase &
  WeightedTimelineField & {
    unparsedData?: unknown;
    inheritedUnparsedData?: unknown;
  };

export type ObjectFieldInstance = FieldInstanceBase &
  Omit<ObjectField, "properties"> & {
    properties: Record<string, FieldInstance>;
    unparsedData: Record<string, unknown>;
  };

export type ArrayFieldInstance = FieldInstanceBase &
  Omit<ArrayField, "items"> & {
    items: FieldInstance[];
    inheritedItems: FieldInstance[];
  } & (
    | {
        isTuple: true;
        itemFieldTypes: Field[];
      }
    | {
        isTuple?: false;
        itemFieldTypes: Field;
      }
  );

export type VariantFieldInstance = FieldInstanceBase &
  Omit<VariantField, "identityField"> & {
    type: "variant";
    identityField: StringFieldInstance & { schemaKey: string };
    activeVariant?: ObjectFieldInstance | null;
  };

export type RootFieldInstance = ObjectFieldInstance | VariantFieldInstance;
