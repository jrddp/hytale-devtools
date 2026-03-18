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
  TimelineField,
  VariantField,
  WeightedTimelineField,
} from "../../src/shared/fieldTypes";
import { parseDocumentText } from "../../webview/hytale-asset-editor/src/parsing/parseDocument.svelte";
import type {
  ArrayFieldInstance,
  BooleanFieldInstance,
  InlineOrReferenceFieldInstance,
  MapFieldInstance,
  NumberFieldInstance,
  ObjectFieldInstance,
  RawJsonFieldInstance,
  RootFieldInstance,
  StringFieldInstance,
  TimelineFieldInstance,
  VariantFieldInstance,
  WeightedTimelineFieldInstance,
} from "../../webview/hytale-asset-editor/src/parsing/fieldInstances";

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

function timelineField(schemaKey: string): TimelineField {
  return {
    ...baseField(schemaKey, "timeline"),
  };
}

function weightedTimelineField(schemaKey: string): WeightedTimelineField {
  return {
    ...baseField(schemaKey, "weightedTimeline"),
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

function expectReady(result: ReturnType<typeof parseDocumentText>): RootFieldInstance {
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(`Expected ready result, received ${result.status}`);
  }
  return result.rootField;
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
  return expectReady(
    parseDocumentText({
      text,
      assetDefinition: assetDefinition(rootField),
      assetsByRef,
    }),
  );
}

describe("asset editor parseDocumentText", () => {
  test("rejects invalid JSON", () => {
    const result = parseDocumentText({
      text: "{",
      assetDefinition: assetDefinition(objectField(null, {})),
      assetsByRef: {},
    });

    expect(result).toMatchObject({
      status: "error",
    });
  });

  test("rejects non-object roots", () => {
    const result = parseDocumentText({
      text: "[]",
      assetDefinition: assetDefinition(objectField(null, {})),
      assetsByRef: {},
    });

    expect(result).toEqual({
      status: "error",
      error: "Document must be a JSON object.",
    });
  });

  test("populates primitive values and nested object fields", () => {
    const rootField = objectField(null, {
      name: stringField("name", { default: "Default Name" }),
      weight: numberField("weight"),
      enabled: booleanField("enabled", { default: false }),
      details: objectField("details", {
        tier: stringField("tier"),
      }),
    });

    const root = parseReady({
      text: JSON.stringify({
        name: "Armor Bronze Hands",
        weight: 12,
        enabled: true,
        details: { tier: "bronze" },
      }),
      rootField,
    }) as ObjectFieldInstance;

    expect((root.properties.name as StringFieldInstance).value).toBe("Armor Bronze Hands");
    expect((root.properties.weight as NumberFieldInstance).value).toBe(12);
    expect((root.properties.enabled as BooleanFieldInstance).value).toBe(true);
    expect(
      ((root.properties.details as ObjectFieldInstance).properties.tier as StringFieldInstance).value,
    ).toBe("bronze");
  });

  test("parses list arrays and tuple arrays", () => {
    const rootField = objectField(null, {
      tags: arrayField("tags", stringField("tag")),
      dimensions: arrayField("dimensions", [numberField("x"), numberField("y")]),
    });

    const root = parseReady({
      text: JSON.stringify({
        tags: ["armor", "bronze"],
        dimensions: [2, 4, 8],
      }),
      rootField,
    }) as ObjectFieldInstance;

    const tags = root.properties.tags as ArrayFieldInstance;
    const dimensions = root.properties.dimensions as ArrayFieldInstance;

    expect(tags.items).toHaveLength(2);
    expect((tags.items[0] as StringFieldInstance).value).toBe("armor");
    expect(dimensions.items).toHaveLength(2);
    expect((dimensions.items[0] as NumberFieldInstance).value).toBe(2);
    expect((dimensions.items[1] as NumberFieldInstance).value).toBe(4);
    expect(dimensions.isTuple).toBe(true);
  });

  test("parses map entries", () => {
    const rootField = objectField(null, {
      labels: mapField("labels", stringField("label")),
    });

    const root = parseReady({
      text: JSON.stringify({
        labels: {
          armor: "Bronze",
          slot: "Hands",
        },
      }),
      rootField,
    }) as ObjectFieldInstance;

    const labels = root.properties.labels as MapFieldInstance;
    expect(labels.entries).toHaveLength(2);
    expect(labels.entries[0]?.key).toBe("armor");
    expect((labels.entries[0]?.valueField as StringFieldInstance).value).toBe("Bronze");
  });

  test("resolves object-backed variant branches", () => {
    const rootField = objectField(null, {
      item: variantField("item", "kind", {
        armor: objectField("", {
          kind: stringField("kind", { const: "armor" }),
          defense: numberField("defense"),
        }),
        tool: objectField("", {
          kind: stringField("kind", { const: "tool" }),
          power: numberField("power"),
        }),
      }),
    });

    const root = parseReady({
      text: JSON.stringify({
        item: {
          kind: "tool",
          power: 7,
        },
      }),
      rootField,
    }) as ObjectFieldInstance;

    const item = root.properties.item as VariantFieldInstance;
    expect(item.identityField.value).toBe("tool");
    expect((item.activeVariant?.properties.power as NumberFieldInstance).value).toBe(7);
    expect((item.activeVariant?.properties.kind as StringFieldInstance).value).toBe("tool");
  });

  test("uses the variant default discriminator when the raw object omits it", () => {
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
    }) as ObjectFieldInstance;

    const ticker = root.properties.ticker as VariantFieldInstance;
    expect(ticker.identityField.value).toBeUndefined();
    expect(ticker.activeVariant).toBeDefined();
    expect((ticker.activeVariant?.properties.CanDemote as BooleanFieldInstance).value).toBe(true);
    expect((ticker.activeVariant?.properties.SupportedBy as StringFieldInstance).value).toBe(
      "Lava_Source",
    );
    expect(ticker.activeVariant?.properties.Type).toBe(ticker.identityField);
  });

  test("parses inheritance-based variant roots when Type is omitted and no default exists", () => {
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
    }) as VariantFieldInstance;

    expect(root.activeVariant).toBeDefined();
    expect((root.activeVariant?.properties.Parent as StringFieldInstance).value).toBe(
      "DamageEntityParent",
    );
    expect(
      ((root.activeVariant?.properties.DamageCalculator as ObjectFieldInstance).properties
        .BaseDamage as NumberFieldInstance).value,
    ).toBe(7);
  });

  test("resolves ref-backed variants and object fields from assetsByRef", () => {
    const rootField = objectField(null, {
      owner: refField("owner", "owner#"),
      item: variantField("item", "kind", {
        armor: refField("", "armor#"),
        tool: refField("", "tool#"),
      }),
    });

    const assetsByRef = assetDefinitionsByRef({
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
    });

    const root = parseReady({
      text: JSON.stringify({
        owner: {
          title: "Caretaker",
        },
        item: {
          kind: "tool",
          power: 7,
        },
      }),
      rootField,
      assetsByRef,
    }) as ObjectFieldInstance;

    const owner = root.properties.owner as ObjectFieldInstance;
    const item = root.properties.item as VariantFieldInstance;

    expect((owner.properties.title as StringFieldInstance).value).toBe("Caretaker");
    expect(item.identityField.value).toBe("tool");
    expect((item.activeVariant?.properties.power as NumberFieldInstance).value).toBe(7);
  });

  test("creates empty resolved ref-backed object fields when the property is absent", () => {
    const rootField = objectField(null, {
      owner: refField("owner", "owner#"),
    });

    const root = parseReady({
      text: "{}",
      rootField,
      assetsByRef: assetDefinitionsByRef({
        "owner#": objectField(null, {
          title: stringField("title"),
        }),
      }),
    }) as ObjectFieldInstance;

    const owner = root.properties.owner as ObjectFieldInstance;
    expect(owner.type).toBe("object");
    expect((owner.properties.title as StringFieldInstance).value).toBeUndefined();
  });

  test("does not materialize nested defaulted variants inside an absent ref-backed object field", () => {
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
    }) as ObjectFieldInstance;

    const damageEffects = root.properties.damageEffects as ObjectFieldInstance;
    const statModifierEffects = root.properties.statModifierEffects as ObjectFieldInstance;

    expect(((damageEffects.properties.Knockback as VariantFieldInstance).identityField.value)).toBeUndefined();
    expect(
      ((statModifierEffects.properties.Knockback as VariantFieldInstance).identityField.value),
    ).toBeUndefined();
  });

  test("parses inline-or-reference string and inline object modes", () => {
    const rootField = objectField(null, {
      referenceOnly: inlineOrReferenceField("referenceOnly", refField("", "inline#")),
      inlineOnly: inlineOrReferenceField("inlineOnly", refField("", "inline#")),
    });

    const root = parseReady({
      text: JSON.stringify({
        referenceOnly: "Items/Armor/Bronze",
        inlineOnly: {
          name: "Inline Item",
        },
      }),
      rootField,
      assetsByRef: assetDefinitionsByRef({
        "inline#": objectField(null, {
          name: stringField("name"),
        }),
      }),
    }) as ObjectFieldInstance;

    const referenceOnly = root.properties.referenceOnly as InlineOrReferenceFieldInstance;
    const inlineOnly = root.properties.inlineOnly as InlineOrReferenceFieldInstance;

    expect(referenceOnly.activeField.type).toBe("string");
    expect((referenceOnly.activeField as StringFieldInstance).value).toBe("Items/Armor/Bronze");
    expect(inlineOnly.activeField.type).toBe("object");
    expect(
      ((inlineOnly.activeField as ObjectFieldInstance).properties.name as StringFieldInstance).value,
    ).toBe("Inline Item");
  });

  test("parses inline-or-reference objects when the resolved ref points at a variant root", () => {
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
    }) as ObjectFieldInstance;

    const next = root.properties.next as InlineOrReferenceFieldInstance;
    expect(next.activeField.type).toBe("variant");
    expect((next.activeField as VariantFieldInstance).activeVariant).toBeDefined();
    expect(((next.activeField as VariantFieldInstance).identityField.value)).toBeUndefined();
    expect(
      (((next.activeField as VariantFieldInstance).activeVariant?.properties.Parent as StringFieldInstance)
        .value),
    ).toBe("Teleporter_Try_Place");
  });

  test("parses inline-or-reference objects when the resolved variant root omits Type and has no default", () => {
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
    }) as ObjectFieldInstance;

    const next = root.properties.next as InlineOrReferenceFieldInstance;
    expect(next.activeField.type).toBe("variant");
    expect((next.activeField as VariantFieldInstance).activeVariant).toBeDefined();
    expect(
      (((next.activeField as VariantFieldInstance).activeVariant?.properties.Parent as StringFieldInstance)
        .value),
    ).toBe("Teleporter_Try_Place");
  });

  test("preserves unknown keys on object fields", () => {
    const rootField = objectField(null, {
      name: stringField("name"),
    });

    const root = parseReady({
      text: JSON.stringify({
        name: 42,
        extra: true,
      }),
      rootField,
    }) as ObjectFieldInstance;

    expect((root.properties.name as StringFieldInstance).value as unknown).toBe(42);
    expect(root.unparsedData).toEqual({ extra: true });
  });

  test("retains raw payloads for rawJson and timeline-backed fields", () => {
    const rootField = objectField(null, {
      payload: rawJsonField("payload"),
      timeline: timelineField("timeline"),
      weighted: weightedTimelineField("weighted"),
    });

    const rawPayload = {
      nested: { value: 1 },
    };

    const root = parseReady({
      text: JSON.stringify({
        payload: rawPayload,
        timeline: [{ time: 0, value: "Idle" }],
        weighted: { Common: 2, Rare: 1 },
      }),
      rootField,
    }) as ObjectFieldInstance;

    expect((root.properties.payload as RawJsonFieldInstance).value).toBe(
      JSON.stringify(rawPayload, null, 2),
    );
    expect((root.properties.timeline as TimelineFieldInstance).unparsedData).toEqual([
      { time: 0, value: "Idle" },
    ]);
    expect((root.properties.weighted as WeightedTimelineFieldInstance).unparsedData).toEqual({
      Common: 2,
      Rare: 1,
    });
  });
});
