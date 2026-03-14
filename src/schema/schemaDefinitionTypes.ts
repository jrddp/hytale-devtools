// # Property Metadata Definitions

import { type IndexReference } from "../shared/indexTypes";

type HytaleDevtoolsMetadata = {
  symbolRef: IndexReference;
  definesSymbol: IndexReference;
};

export type JsonType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";
export type HytaleType =
  | JsonType
  | "Color"
  | "Enum"
  | "EnumMap"
  | "Number"
  | "ColorAlpha"
  | "ColorShort";
type UiRebuildCache = "BlockTextures" | "ItemIcons" | "MapGeometry" | "Models" | "ModelTextures";
type HytaleComponentType =
  | "Dropdown"
  | "Icon"
  | "LocalizationKey"
  | "Number"
  | "Text"
  | "Timeline"
  | "WeightedTimeline";

type HytaleComponentMetadata = {
  component: HytaleComponentType;
  dataSet?: string;
  defaultPathTemplate?: string;
  generateDefaultKey?: boolean;
  height?: number;
  keyTemplate?: string;
  suffix?: string;
  width?: number;
  step?: number;
};

/** For variants: Identifies potential values and identifier property of the variants */
type HytaleSchemaTypeField = {
  property: "Id" | "Op" | "Type" | string;
  values: string[];
  parentPropertyKey?: "Parent" | string;
  defaultValue?: string;
};

type CommonAssetMetadata = {
  requiredRoots: string[];
  requiredExtension?: "blockyanim" | "blockymodel" | "png" | string;
  isUIAsset?: boolean;
};

type PropertyHytaleMetadata = {
  allowEmptyObject?: boolean;
  inheritsProperty?: boolean;
  mergesProperties?: boolean;
  type?: HytaleType;
  uiCollapsedByDefault?: boolean;
  uiDisplayMode?: "Compact" | "Hidden";
  uiEditorComponent?: HytaleComponentMetadata;
  uiPropertyTitle?: string;
  uiRebuildCaches?: UiRebuildCache[];
  uiRebuildCachesForChildProperties?: boolean;
  uiSectionStart?: string;
};

type PropertyDefinitionBase = {
  default?: unknown;
  const?: unknown;
  description?: string;
  doNotSuggest?: boolean;
  hytale?: PropertyHytaleMetadata;
  hytaleAssetRef?: string;
  hytaleSchemaTypeField?: HytaleSchemaTypeField;
  markdownDescription?: string;
  title?: string;
  type?: JsonType | [JsonType, "null"];
};

// # Property Type Definitions

export type StringPropertyDefinition = PropertyDefinitionBase & {
  default?: string;
  enum?: string[];
  enumDescriptions?: string[];
  markdownEnumDescriptions?: string[];
  hytaleDevtools?: HytaleDevtoolsMetadata;
  hytaleCommonAsset?: CommonAssetMetadata;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  hytaleParent?: {
    type: string;
    mapKey?: string;
    mapKeyValue?: string;
  };
  /** Not used */
  hytaleCosmeticAsset?: string;
  hytaleCustomAssetRef?: string;
  const?: string;
} & (
    | {
        type: "string" | ["string", "null"];
      }
    | {
        hytale: PropertyHytaleMetadata & {
          type: "string";
        };
      }
  );

export type ExclusionEnumDefinition = PropertyDefinitionBase & {
  type: never;
  allOf: [
    {
      type: ["null", "string"];
      hytale: {
        type: "string";
      };
    },
    {
      not: {
        type: "string";
        hytale: {
          type: "string";
        };
        enum: string[];
      };
    },
  ];
};

export type NumberPropertyDefinition = PropertyDefinitionBase & {
  type: "number" | "integer" | ["number", "null"] | ["integer", "null"];
  default?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  maximum?: number;
  minimum?: number;
  allOf?: {
    not: {
      const: number;
    };
  }[];
  const?: number;
};

export type BooleanPropertyDefinition = PropertyDefinitionBase & {
  type: "boolean" | ["boolean", "null"];
  default?: boolean;
};

export type ArrayPropertyDefinition = PropertyDefinitionBase & {
  type: "array" | ["array", "null"];
  items: PropertyDefinition | PropertyDefinition[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

export type AnyOfPropertyDefinition = PropertyDefinitionBase & {
  anyOf: PropertyDefinition[];
};

export type RefPropertyDefinition = PropertyDefinitionBase & {
  $ref: string;
};

export type ObjectPropertyDefinition = PropertyDefinitionBase & {
  type: "object" | ["object", "null"];
  properties?: Record<string, PropertyDefinition>;
  /** The default definition for values if they are not defined explicitly in properties */
  additionalProperties?: false | PropertyDefinition;
  /** Typically set with "enum" to indicate valid property names for "EnumMap"s */
  // for some reason, it sometimes omits the json "type" field
  propertyNames?: StringPropertyDefinition;
};

export type PropertyDefinition =
  | StringPropertyDefinition
  | NumberPropertyDefinition
  | BooleanPropertyDefinition
  | ArrayPropertyDefinition
  | ObjectPropertyDefinition
  | AnyOfPropertyDefinition
  | RefPropertyDefinition
  | ExclusionEnumDefinition;

// #Schema-Level Definitions

type UiEditorFeature = "WeatherDaytimeBar" | "WeatherPreviewLocal";
type ButtonDefinition = {
  buttonId: "EquipItem" | "ResetModel" | "UseModel";
  textId: string;
};

type SchemaHytaleMetadata = {
  type?: "object";
  /** Hard-coded assets that are not registered elsewhere */
  internalKeys?: string[];
  // assumption: this is always defined set to true for schema-level definitions
  mergesProperties: true;
  idProvider?: string;
  uiCreateButtons?: ButtonDefinition[];
  uiEditorFeatures?: UiEditorFeature[];
  uiEditorIgnore?: boolean;
  uiEditorPreview?: "EqualizerEffect" | "Item" | "Model" | "ReverbEffect";
  uiRebuildCaches?: UiRebuildCache[];
  uiRebuildCachesForChildProperties?: boolean;
  uiSidebarButtons?: ButtonDefinition[];
  uiTypeIcon?: string;
  uiDisplayMode?: "Compact" | "Hidden";
};

export type SchemaDefinition = {
  hytale: SchemaHytaleMetadata;
  title: string;
  // TODO this seems to be only used for required: Type or Parent in common.json. check if these have special handling in the Asset Editor
  oneOf?: { required: string[] }[];
} & (
  | ObjectPropertyDefinition
  | { anyOf: PropertyDefinition[]; hytaleSchemaTypeField: HytaleSchemaTypeField }
);

export type CommonSchemaFile = {
  $id: string;
  definitions: Record<string, SchemaDefinition>;
};

export type StandardSchemaFile = SchemaDefinition & {
  $id: string;
  hytale: SchemaHytaleMetadata & { path: string; extension: string };
};
