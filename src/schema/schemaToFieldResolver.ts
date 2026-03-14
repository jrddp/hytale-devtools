import { type BasicLogger } from "../../shared/commonTypes";
import {
  type AssetDefinition,
  type Field,
  type InlineOrReferenceField,
  type ObjectField,
  type RefField,
  type StringField,
  type VariantField,
} from "../../shared/fieldTypes";
import {
  type AnyOfPropertyDefinition,
  type ArrayPropertyDefinition,
  type ExclusionEnumDefinition,
  type NumberPropertyDefinition,
  type ObjectPropertyDefinition,
  type PropertyDefinition,
  type RefPropertyDefinition,
  type SchemaDefinition,
  type StringPropertyDefinition,
} from "./schemaDefinitionTypes";

type ParsingState = {
  currentSection: string | null;
  unhydratedVariants: VariantField[];
  logger: BasicLogger;
};

function propertyDefinitionToField(
  schemaKey: string,
  definition: PropertyDefinition,
  state: ParsingState,
): Field | null {
  // TODO include full metadata

  // hidden property
  if (definition.doNotSuggest) {
    return null;
  }

  if (definition.hytale?.uiSectionStart) {
    state.currentSection = definition.hytale.uiSectionStart;
  }

  // # Ref
  if ("$ref" in definition) {
    definition = definition as RefPropertyDefinition;
    return {
      schemaKey,
      type: "ref",
      section: state.currentSection,
      $ref: definition.$ref,
    };
  }

  // # AllOf (String Enum Exclusion)
  if (!("type" in definition) && "allOf" in definition) {
    let allOfDefinition: ExclusionEnumDefinition = definition as ExclusionEnumDefinition;
    return {
      schemaKey,
      type: "string",
      section: state.currentSection,
      bannedValues: allOfDefinition.allOf[1].not.enum,
    };
  }

  // # AnyOf
  if ("anyOf" in definition) {
    definition = definition as AnyOfPropertyDefinition;
    // handle nullability (assumption: nullability is indicated by anyOf.length == 2 and second type is "null")
    if (definition.anyOf.length === 2 && definition.anyOf[1].type === "null") {
      definition.anyOf = definition.anyOf.slice(0, 1);
      const baseField = propertyDefinitionToField(schemaKey, definition.anyOf[0], state);
      if (!baseField) {
        return null;
      }
      return {
        ...baseField,
        nullable: true,
      };
    }

    // ## Number with special properties
    if (definition.hytale?.type === "Number" || definition.hytale?.type === "integer") {
      let minimum: number | undefined;
      let maximum: number | undefined;
      let exclusiveMinimum: number | undefined;
      let exclusiveMaximum: number | undefined;
      let step: number | undefined;
      let isInteger: boolean | undefined;
      let allowInfinity: boolean | undefined;
      let constantExceptions: number[] = [];
      for (let anyOf of definition.anyOf) {
        if (anyOf.type === "integer" || anyOf.type === "number") {
          anyOf = anyOf as NumberPropertyDefinition;
          minimum = anyOf.minimum;
          maximum = anyOf.maximum;
          exclusiveMinimum = anyOf.exclusiveMinimum;
          exclusiveMaximum = anyOf.exclusiveMaximum;
          step = anyOf.hytale?.uiEditorComponent?.step;
          isInteger = anyOf.type === "integer";
          if (anyOf.const !== undefined) {
            constantExceptions.push(anyOf.const as number);
          }
        } else if (anyOf.type === "string") {
          anyOf = anyOf as StringPropertyDefinition;
          if (anyOf.pattern !== "^(-?Infinity|NaN)$") {
            state.logger.error(
              `Unexpected string pattern in number property: ${JSON.stringify(anyOf)}`,
            );
          }
          allowInfinity = true;
        }
      }
      return {
        schemaKey,
        type: "number",
        section: state.currentSection,
        minimum,
        maximum,
        exclusiveMinimum,
        exclusiveMaximum,
        step,
        isInteger,
        allowInfinity,
        constantExceptions,
        bannedValues: [],
      };
    }

    // ## Color
    if (
      definition.hytale?.type === "Color" ||
      definition.hytale?.type === "ColorAlpha" ||
      definition.hytale?.type === "ColorShort"
    ) {
      return {
        schemaKey,
        type: "color",
        section: state.currentSection,
        colorType: definition.hytale?.type,
      };
    }

    // ## Variant
    if (definition.hytaleSchemaTypeField) {
      const schemaTypeField = definition.hytaleSchemaTypeField;
      const identityField: StringField & { schemaKey: string } = {
        schemaKey: schemaTypeField.property,
        type: "string",
        section: null,
        default: schemaTypeField.defaultValue,
        enumVals: schemaTypeField.values,
      };
      const field: VariantField = {
        schemaKey,
        type: "variant",
        section: state.currentSection,
        identityField: identityField,
        variantsByIdentity: {},
        unmappedFields: definition.anyOf
          .map(
            variantDefinition =>
              propertyDefinitionToField("", variantDefinition, state) as ObjectField | RefField,
          )
          .filter(field => field !== null),
      };
      state.unhydratedVariants.push(field);
      return field;
    }

    // ## InlineOrReference
    // assumption: string comes first, then ref
    if (
      definition.anyOf.length === 2 &&
      definition.anyOf[0].type === "string" &&
      "$ref" in definition.anyOf[1]
    ) {
      const [stringDefinition, refDefinition] = definition.anyOf as [
        StringPropertyDefinition,
        RefPropertyDefinition,
      ];
      const stringField: StringField = {
        schemaKey,
        type: "string",
        section: state.currentSection,
        pattern: stringDefinition.pattern,
        minLength: stringDefinition.minLength,
        maxLength: stringDefinition.maxLength,
        enumVals: stringDefinition.enum,
        markdownEnumDescriptions: stringDefinition.enumDescriptions,
        symbolRef: stringDefinition.hytaleDevtools?.symbolRef,
        definesSymbol: stringDefinition.hytaleDevtools?.definesSymbol,
        isLocalizationKey:
          stringDefinition.hytale?.uiEditorComponent?.component === "LocalizationKey",
        localizationKeyTemplate: stringDefinition.hytale?.uiEditorComponent?.keyTemplate,
        const: stringDefinition.const,
      };
      const refField: RefField = {
        schemaKey,
        type: "ref",
        section: state.currentSection,
        $ref: refDefinition.$ref,
      };
      return {
        schemaKey,
        type: "inlineOrReference",
        section: state.currentSection,
        stringField,
        inlineField: refField,
      } as InlineOrReferenceField;
    }

    state.logger.error(`Unparsable anyOf property shape: ${JSON.stringify(definition)}`);
    return null;
  }

  if ("type" in definition) {
    // handle nullability
    if (Array.isArray(definition.type)) {
      if (definition.type[1] !== "null") {
        state.logger.error(`Unexpected multi-type: ${JSON.stringify(definition)}`);
        return null;
      }
      // @ts-ignore type[0] is guaranteed to be a JsonType
      definition.type = definition.type[0];
      const baseField = propertyDefinitionToField(schemaKey, definition, state);
      if (!baseField) {
        return null;
      }
      return {
        ...baseField,
        nullable: true,
      };
    }
  }

  const trueType = definition.hytale?.type ?? definition.type;

  switch (trueType) {
    // # Colors
    // catch for non-any-of. only seen applicable for ColorShort
    case "Color":
    case "ColorAlpha":
    case "ColorShort":
      return {
        schemaKey,
        type: "color",
        section: state.currentSection,
        colorType: trueType,
      };

    // # String
    case "string":
    case "Enum":
      definition = definition as StringPropertyDefinition;
      return {
        schemaKey,
        type: "string",
        section: state.currentSection,
        pattern: definition.pattern,
        minLength: definition.minLength,
        maxLength: definition.maxLength,
        enumVals: definition.enum,
        markdownEnumDescriptions:
          definition.markdownEnumDescriptions ?? definition.enumDescriptions,
        symbolRef: definition.hytaleDevtools?.symbolRef,
        definesSymbol: definition.hytaleDevtools?.definesSymbol,
        isLocalizationKey: definition.hytale?.uiEditorComponent?.component === "LocalizationKey",
        localizationKeyTemplate: definition.hytale?.uiEditorComponent?.keyTemplate,
      };

    // # Number
    case "number":
    case "integer":
      definition = definition as NumberPropertyDefinition;
      let bannedValues: number[] = [];
      // rare case: allOf is used to ban specific values (e.g. 0 in ReputationCompletionAsset)
      if (definition.allOf) {
        for (const allOf of definition.allOf) {
          if ("not" in allOf) {
            bannedValues.push(allOf.not.const);
          } else {
            state.logger.error(`Unexpected allOf property shape: ${JSON.stringify(allOf)}`);
          }
        }
      }
      return {
        schemaKey,
        type: "number",
        section: state.currentSection,
        minimum: definition.minimum,
        maximum: definition.maximum,
        exclusiveMinimum: definition.exclusiveMinimum,
        exclusiveMaximum: definition.exclusiveMaximum,
        step: definition.hytale?.uiEditorComponent?.step,
        isInteger: definition.type === "integer",
        allowInfinity: false,
        constantExceptions: [],
        bannedValues,
      };

    // # Boolean
    case "boolean":
      return {
        schemaKey,
        type: "boolean",
        section: state.currentSection,
      };

    // # Array
    case "array":
      definition = definition as ArrayPropertyDefinition;

      if (definition.hytale?.uiEditorComponent?.component === "Timeline") {
        return {
          schemaKey,
          type: "timeline",
          section: state.currentSection,
        };
      }

      let items;
      if (Array.isArray(definition.items)) {
        // items is an array -> array is a tuple
        items = definition.items.map(item => propertyDefinitionToField(schemaKey, item, state));
      } else {
        // items is a single item -> array is a list
        items = propertyDefinitionToField(schemaKey, definition.items, state);
      }
      if (!items || (Array.isArray(items) && items.some(item => item === null))) {
        state.logger.error(`Items not understood in array property: ${JSON.stringify(definition)}`);
        return null;
      }
      return {
        schemaKey,
        type: "array",
        section: state.currentSection,
        items: items as Field | Field[],
        minItems: definition.minItems,
        maxItems: definition.maxItems,
        uniqueItems: definition.uniqueItems,
      };

    case "EnumMap": // ## EnumMap
      definition = definition as ObjectPropertyDefinition;

      // assumption: propertyNames is always defined for EnumMaps
      const propertyNames = definition.propertyNames as StringPropertyDefinition;
      // assumption: in all "EnumMap" properties, all properties + additionalProperties exist and have the same definition
      const additionalProperties = definition.additionalProperties as PropertyDefinition;
      const keyField = propertyDefinitionToField(schemaKey, propertyNames, state) as StringField;
      const valueField = propertyDefinitionToField(schemaKey, additionalProperties, state);
      if (!valueField) {
        state.logger.error(
          `Value field not understood in EnumMap property: ${JSON.stringify(definition)}`,
        );
        return null;
      }
      return {
        schemaKey,
        type: "map",
        section: state.currentSection,
        keyField,
        valueField,
      };

    // # Object
    case "object":
      definition = definition as ObjectPropertyDefinition;

      // ## WeightedTimeline
      if (definition.hytale?.uiEditorComponent?.component === "WeightedTimeline") {
        return {
          schemaKey,
          type: "weightedTimeline",
          section: state.currentSection,
        };
      }

      // ## Nested Object
      if (definition.properties) {
        const fieldProperties = Object.entries(definition.properties).reduce(
          (acc, [key, value]) => {
            const field = propertyDefinitionToField(schemaKey, value, state);
            if (!field) {
              return acc;
            }
            acc[key] = field;
            return acc;
          },
          {} as Record<string, Field>,
        );
        return {
          schemaKey,
          type: "object",
          section: state.currentSection,
          properties: fieldProperties,
        };
      }

      // ## Map
      if (definition.additionalProperties) {
        const mapKeyField: StringField = definition.propertyNames
          ? (propertyDefinitionToField(schemaKey, definition.propertyNames, state) as StringField)
          : { schemaKey: null, type: "string", section: null };
        const mapValueField = propertyDefinitionToField(
          schemaKey,
          definition.additionalProperties,
          state,
        );
        if (!mapValueField) {
          state.logger.error(
            `Value field not understood in map property: ${JSON.stringify(definition)}`,
          );
          return null;
        }
        return {
          schemaKey,
          type: "map",
          section: state.currentSection,
          keyField: mapKeyField,
          valueField: mapValueField,
        };
      }

      return {
        schemaKey,
        type: "rawJson",
        section: state.currentSection,
      };
  }

  state.logger.error(`Unparsable property definition: ${JSON.stringify(definition)}`);
  return null;
}

export function schemaDefinitionToAssetDefinition(
  definition: SchemaDefinition,
  unhydratedVariants: VariantField[],
  logger: BasicLogger,
): AssetDefinition | null {
  const rootField = propertyDefinitionToField("", definition, {
    currentSection: "General",
    unhydratedVariants,
    logger,
  });
  const buttons = definition.hytale.uiSidebarButtons?.map(button => button.buttonId) ?? [];
  if (!rootField || (rootField.type !== "variant" && rootField.type !== "object")) {
    logger.error("Unexpected root field for asset definition: ${JSON.stringify(definition)}");
    return null;
  }
  return {
    title: definition.title,
    rootField,
    buttons,
  };
}
