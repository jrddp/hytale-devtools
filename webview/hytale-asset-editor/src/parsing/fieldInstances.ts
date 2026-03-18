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
} from "@shared/fieldTypes";

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

export type StringFieldInstance = StringField & { value?: string };
export type NumberFieldInstance = NumberField & { value?: number | string };
export type BooleanFieldInstance = BooleanField & { value?: boolean };
export type ColorFieldInstance = ColorField & { value?: string };

export type MapFieldInstance = MapField & {
  valueField: FieldInstance;
  entries: { key: string; valueField: FieldInstance }[];
};

export type InlineOrReferenceFieldInstance = InlineOrReferenceField & {
  activeField: StringFieldInstance | ObjectFieldInstance;
};
export type RawJsonFieldInstance = RawJsonField & { value?: string };
export type TimelineFieldInstance = TimelineField & { unparsedData?: unknown };
export type WeightedTimelineFieldInstance = WeightedTimelineField & {
  unparsedData?: unknown;
};

export type ObjectFieldInstance = Omit<ObjectField, "properties"> & {
  properties: Record<string, FieldInstance>;
  unparsedData: Record<string, unknown>;
};

export type ArrayFieldInstance = Omit<ArrayField, "items"> & { items: FieldInstance[] } & (
    | {
        isTuple: true;
        itemFieldTypes: Field[];
      }
    | {
        isTuple?: false;
        itemFieldTypes: Field;
      }
  );

export type VariantFieldInstance = Omit<VariantField, "identityField"> & {
  type: "variant";
  identityField: StringFieldInstance & { schemaKey: string };
  activeVariant?: ObjectFieldInstance | null;
};

export type RootFieldInstance = ObjectFieldInstance | VariantFieldInstance;
