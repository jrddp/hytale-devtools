import { describe, expect, test } from "vitest";

import type {
  ArrayField,
  AssetDefinition,
  BooleanField,
  Field,
  FieldBase,
  InlineOrReferenceField,
  MapField,
  NumberField,
  ObjectField,
  RawJsonField,
  RefField,
  StringField,
  VariantField,
} from "@shared/fieldTypes";
import type { RootFieldInstance } from "../../webview/hytale-asset-editor/src/parsing/fieldInstances";
import { parseDocumentText } from "../../webview/hytale-asset-editor/src/parsing/parseDocument";
import { serializeDocument } from "../../webview/hytale-asset-editor/src/parsing/serializeDocument";

function baseField(schemaKey: string | null, type: FieldBase["type"]): FieldBase {
  return {
    schemaKey,
    type,
    section: "General",
    collapsedByDefault: false,
  };
}

function assetDefinition(rootField: ObjectField | VariantField, title = "Test Asset"): AssetDefinition {
  return {
    title,
    rootField,
    buttons: [],
    refDependencies: new Set<string>(),
  };
}

function assetDefinitionsByRef(
  fieldsByRef: Record<string, ObjectField | VariantField>,
): Record<string, AssetDefinition> {
  return Object.fromEntries(
    Object.entries(fieldsByRef).map(([ref, rootField]) => [ref, assetDefinition(rootField, ref)]),
  );
}

function stringField(schemaKey: string, overrides: Partial<StringField> = {}): StringField {
  return {
    ...baseField(schemaKey, "string"),
    ...overrides,
  };
}

function numberField(schemaKey: string, overrides: Partial<NumberField> = {}): NumberField {
  return {
    ...baseField(schemaKey, "number"),
    ...overrides,
  };
}

function booleanField(schemaKey: string, overrides: Partial<BooleanField> = {}): BooleanField {
  return {
    ...baseField(schemaKey, "boolean"),
    ...overrides,
  };
}

function rawJsonField(schemaKey: string): RawJsonField {
  return {
    ...baseField(schemaKey, "rawJson"),
  };
}

function refField(schemaKey: string, $ref: string): RefField {
  return {
    ...baseField(schemaKey, "ref"),
    $ref,
  };
}

function objectField(
  schemaKey: string | null,
  properties: Record<string, Field>,
): ObjectField {
  return {
    ...baseField(schemaKey, "object"),
    properties,
  };
}

function arrayField(schemaKey: string, items: ArrayField["items"]): ArrayField {
  return {
    ...baseField(schemaKey, "array"),
    items,
  };
}

function mapField(schemaKey: string, valueField: Field): MapField {
  return {
    ...baseField(schemaKey, "map"),
    keyField: stringField(schemaKey),
    valueField,
  };
}

function inlineOrReferenceField(
  schemaKey: string,
  inlineField: InlineOrReferenceField["inlineField"],
): InlineOrReferenceField {
  return {
    ...baseField(schemaKey, "inlineOrReference"),
    stringField: stringField(schemaKey),
    inlineField,
  };
}

function variantField(
  schemaKey: string,
  identityKey: string,
  variantsByIdentity: Record<string, RefField | ObjectField>,
  identityFieldOverrides: Partial<StringField> = {},
): VariantField {
  return {
    ...baseField(schemaKey, "variant"),
    identityField: {
      ...stringField(identityKey),
      enumVals: Object.keys(variantsByIdentity),
      ...identityFieldOverrides,
    },
    variantsByIdentity,
  };
}

function parseReady({
  text,
  rootField,
  assetsByRef = {},
}: {
  text: string;
  rootField: ObjectField | VariantField;
  assetsByRef?: Record<string, AssetDefinition>;
}): RootFieldInstance {
  const result = parseDocumentText({
    text,
    assetDefinition: assetDefinition(rootField),
    assetsByRef,
  });

  if (result.status !== "ready") {
    throw new Error(`Expected ready parse result, received ${result.status}`);
  }

  return result.rootField;
}

function normalizeRoundTripJson(value: unknown, isRoot = true): unknown {
  if (Array.isArray(value)) {
    const normalized = value
      .map(item => normalizeRoundTripJson(item, false))
      .filter(item => item !== undefined);
    return normalized.length > 0 || isRoot ? normalized : undefined;
  }

  if (value && typeof value === "object") {
    const normalized = Object.fromEntries(
      Object.entries(value).flatMap(([key, childValue]) => {
        const normalizedChild = normalizeRoundTripJson(childValue, false);
        return normalizedChild === undefined ? [] : [[key, normalizedChild]];
      }),
    );
    return Object.keys(normalized).length > 0 || isRoot ? normalized : undefined;
  }

  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

describe("asset editor serializeDocument", () => {
  test("round-trips representative parsed documents with current assetsByRef resolution", () => {
    const rootField = objectField(null, {
      name: stringField("name"),
      weight: numberField("weight"),
      enabled: booleanField("enabled"),
      details: objectField("details", {
        tier: stringField("tier"),
      }),
      tags: arrayField("tags", stringField("tag")),
      dimensions: arrayField("dimensions", [numberField("x"), numberField("y")]),
      labels: mapField("labels", stringField("label")),
      owner: refField("owner", "owner#"),
      item: variantField("item", "kind", {
        armor: refField("", "armor#"),
        tool: refField("", "tool#"),
      }),
      inlineRef: inlineOrReferenceField("inlineRef", refField("", "inline#")),
      payload: rawJsonField("payload"),
    });

    const documentJson = {
      name: "Armor Bronze Hands",
      weight: 0,
      enabled: false,
      details: {
        tier: "bronze",
      },
      tags: ["armor", "bronze"],
      dimensions: [2, 4],
      labels: {
        slot: "Hands",
        rarity: "Common",
      },
      owner: {
        title: "Caretaker",
      },
      item: {
        kind: "armor",
        defense: 7,
      },
      inlineRef: {
        title: "Inline Value",
      },
      payload: {
        nested: "value",
      },
    };

    const root = parseReady({
      text: JSON.stringify(documentJson),
      rootField,
      assetsByRef: assetDefinitionsByRef({
        "owner#": objectField(null, {
          title: stringField("title"),
        }),
        "armor#": objectField(null, {
          kind: stringField("kind", { const: "armor" }),
          defense: numberField("defense"),
        }),
        "tool#": objectField(null, {
          kind: stringField("kind", { const: "tool" }),
          power: numberField("power"),
        }),
        "inline#": objectField(null, {
          title: stringField("title"),
        }),
      }),
    });

    expect(normalizeRoundTripJson(serializeDocument(root))).toEqual(normalizeRoundTripJson(documentJson));
  });

  test("omits unset scalars and empty composites from object output", () => {
    const rootField = objectField(null, {
      name: stringField("name"),
      count: numberField("count"),
      enabled: booleanField("enabled"),
      meta: objectField("meta", {}),
      tags: arrayField("tags", stringField("tag")),
      labels: mapField("labels", stringField("label")),
      inlineRef: inlineOrReferenceField("inlineRef", objectField("", { title: stringField("title") })),
    });

    const root = parseReady({
      text: JSON.stringify({
        meta: {},
        tags: [],
        labels: {},
        inlineRef: null,
      }),
      rootField,
    });

    expect(serializeDocument(root)).toEqual({});
  });

  test("does not drop variant fields whose discriminator is implied by the schema default", () => {
    const rootField = objectField(null, {
      ticker: variantField(
        "ticker",
        "Type",
        {
          Default: objectField("", {
            Type: stringField("Type", { const: "Default" }),
            CanDemote: booleanField("CanDemote"),
            SupportedBy: stringField("SupportedBy"),
          }),
        },
        { default: "Default" },
      ),
    });

    const root = parseReady({
      text: JSON.stringify({
        ticker: {
          CanDemote: true,
          SupportedBy: "Lava_Source",
        },
      }),
      rootField,
    });

    expect(serializeDocument(root)).toHaveProperty("ticker");
  });

  test("round-trips inheritance-based variant roots when Type is omitted and no default exists", () => {
    const root = parseReady({
      text: JSON.stringify({
        Parent: "DamageEntityParent",
        DamageCalculator: {
          BaseDamage: 7,
        },
        DamageEffects: {
          Knockback: {
            Type: "Directional",
            Force: 1,
          },
        },
      }),
      rootField: variantField(null, "Type", {
        DamageEntity: objectField("", {
          Type: stringField("Type", { const: "DamageEntity" }),
          Parent: stringField("Parent"),
          DamageCalculator: objectField("DamageCalculator", {
            BaseDamage: numberField("BaseDamage"),
          }),
          DamageEffects: objectField("DamageEffects", {
            Knockback: variantField(
              "Knockback",
              "Type",
              {
                Directional: objectField("", {
                  Type: stringField("Type", { const: "Directional" }),
                  Force: numberField("Force"),
                }),
              },
              { default: "Directional" },
            ),
          }),
        }),
      }),
    });

    expect(normalizeRoundTripJson(serializeDocument(root))).toEqual(
      normalizeRoundTripJson({
        Parent: "DamageEntityParent",
        DamageCalculator: {
          BaseDamage: 7,
        },
        DamageEffects: {
          Knockback: {
            Type: "Directional",
            Force: 1,
          },
        },
      }),
    );
  });

  test("does not drop inline ref objects when the resolved ref points at a variant root", () => {
    const rootField = objectField(null, {
      next: inlineOrReferenceField("next", refField("", "interaction#")),
    });

    const root = parseReady({
      text: JSON.stringify({
        next: {
          Parent: "Teleporter_Try_Place",
          Value: 2,
        },
      }),
      rootField,
      assetsByRef: assetDefinitionsByRef({
        "interaction#": variantField(
          null,
          "Type",
          {
            MemoriesCondition: objectField("", {
              Type: stringField("Type", { const: "MemoriesCondition" }),
              Parent: stringField("Parent"),
              Value: numberField("Value"),
            }),
          },
          { default: "MemoriesCondition" },
        ),
      }),
    });

    expect(serializeDocument(root)).toHaveProperty("next");
  });

  test("does not drop inline ref objects when the resolved variant root omits Type and has no default", () => {
    const rootField = objectField(null, {
      next: inlineOrReferenceField("next", refField("", "interaction#")),
    });

    const root = parseReady({
      text: JSON.stringify({
        next: {
          Parent: "Teleporter_Try_Place",
          Value: 2,
        },
      }),
      rootField,
      assetsByRef: assetDefinitionsByRef({
        "interaction#": variantField(null, "Type", {
          MemoriesCondition: objectField("", {
            Type: stringField("Type", { const: "MemoriesCondition" }),
            Parent: stringField("Parent"),
            Value: numberField("Value"),
          }),
        }),
      }),
    });

    expect(normalizeRoundTripJson(serializeDocument(root))).toEqual(
      normalizeRoundTripJson({
        next: {
          Parent: "Teleporter_Try_Place",
          Value: 2,
        },
      }),
    );
  });

  test("does not serialize absent nullable ref-backed objects just because they contain nested defaulted variants", () => {
    const rootField = objectField(null, {
      damageEffects: {
        ...refField("damageEffects", "damageEffects#"),
        nullable: true,
      },
      statModifierEffects: {
        ...refField("statModifierEffects", "damageEffects#"),
        nullable: true,
      },
    });

    const damageEffectsField = objectField(null, {
      Knockback: variantField(
        "Knockback",
        "Type",
        {
          Directional: objectField("", {
            Type: stringField("Type", { const: "Directional" }),
            Force: numberField("Force"),
          }),
        },
        { default: "Directional" },
      ),
    });

    const root = parseReady({
      text: "{}",
      rootField,
      assetsByRef: assetDefinitionsByRef({
        "damageEffects#": damageEffectsField,
      }),
    });

    expect(serializeDocument(root)).toEqual({});
  });
});
