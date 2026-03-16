import { describe, expect, test } from "vitest";

import type {
  ArrayField,
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
} from "@shared/fieldTypes";
import { parseDocumentText } from "../../webview/hytale-asset-editor/src/parsing/parseDocument.svelte";
import type {
  ArrayFieldInstance,
  BooleanFieldInstance,
  InlineOrReferenceFieldInstance,
  MapFieldInstance,
  NumberFieldInstance,
  ObjectFieldInstance,
  RawJsonFieldInstance,
  RefFieldInstance,
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
  variantsByIdentity: Record<string, ObjectField>,
): VariantField {
  return {
    ...baseField(schemaKey, "variant"),
    identityField: {
      ...stringField(identityKey),
      enumVals: Object.keys(variantsByIdentity),
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

describe("asset editor parseDocumentText", () => {
  test("rejects invalid JSON", () => {
    const result = parseDocumentText({
      text: "{",
      rootField: objectField(null, {}),
    });

    expect(result).toMatchObject({
      status: "error",
    });
  });

  test("rejects non-object roots", () => {
    const result = parseDocumentText({
      text: "[]",
      rootField: objectField(null, {}),
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

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          name: "Armor Bronze Hands",
          weight: 12,
          enabled: true,
          details: { tier: "bronze" },
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

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

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          tags: ["armor", "bronze"],
          dimensions: [2, 4, 8],
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

    const tags = root.properties.tags as ArrayFieldInstance;
    const dimensions = root.properties.dimensions as ArrayFieldInstance;

    expect(tags.parsedItems).toHaveLength(2);
    expect((tags.parsedItems[0] as StringFieldInstance).value).toBe("armor");
    expect(dimensions.parsedItems).toHaveLength(1);
    expect(((dimensions.parsedItems[0] as NumberFieldInstance[])[0] as NumberFieldInstance).value).toBe(2);
    expect(((dimensions.parsedItems[0] as NumberFieldInstance[])[1] as NumberFieldInstance).value).toBe(4);
    expect(dimensions.unparsedData).toEqual([8]);
  });

  test("parses map entries", () => {
    const rootField = objectField(null, {
      labels: mapField("labels", stringField("label")),
    });

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          labels: {
            armor: "Bronze",
            slot: "Hands",
          },
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

    const labels = root.properties.labels as MapFieldInstance;
    expect(labels.entries).toHaveLength(2);
    expect(labels.entries[0]?.key).toBe("armor");
    expect((labels.entries[0]?.valueField as StringFieldInstance).value).toBe("Bronze");
  });

  test("selects only the active variant branch", () => {
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

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          item: {
            kind: "tool",
            power: 7,
          },
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

    const item = root.properties.item as VariantFieldInstance;
    expect(item.selectedIdentity).toBe("tool");
    expect((item.activeVariantField?.properties.power as NumberFieldInstance).value).toBe(7);
    expect((item.activeVariantField?.properties.kind as StringFieldInstance).value).toBe("tool");
  });

  test("waits for only reachable refs and resolves them across multiple passes", () => {
    const toolVariant = objectField("", {
      kind: stringField("kind", { const: "tool" }),
      owner: refField("owner", "owner#"),
    });
    const armorVariant = objectField("", {
      kind: stringField("kind", { const: "armor" }),
      stats: refField("stats", "stats#"),
    });
    const rootField = objectField(null, {
      item: variantField("item", "kind", {
        armor: armorVariant,
        tool: toolVariant,
      }),
    });

    const text = JSON.stringify({
      item: {
        kind: "tool",
        owner: {
          profile: {
            handle: "@caretaker",
          },
          title: "Caretaker",
        },
      },
    });

    const firstPass = parseDocumentText({
      text,
      rootField,
    });
    expect(firstPass).toEqual({
      status: "waiting-for-refs",
      missingRefs: ["owner#"],
    });

    const secondPass = parseDocumentText({
      text,
      rootField,
      resolvedRefsByRef: new Map([
        [
          "owner#",
          objectField(null, {
            title: stringField("title"),
            profile: refField("profile", "profile#"),
          }),
        ],
      ]),
    });
    expect(secondPass).toEqual({
      status: "waiting-for-refs",
      missingRefs: ["profile#"],
    });

    const root = expectReady(
      parseDocumentText({
        text,
        rootField,
        resolvedRefsByRef: new Map([
          [
            "owner#",
            objectField(null, {
              title: stringField("title"),
              profile: refField("profile", "profile#"),
            }),
          ],
          [
            "profile#",
            objectField(null, {
              handle: stringField("handle"),
            }),
          ],
        ]),
      }),
    ) as ObjectFieldInstance;

    const owner = (root.properties.item as VariantFieldInstance).activeVariantField?.properties
      .owner as RefFieldInstance;
    expect((owner.resolvedField as ObjectFieldInstance).properties.title.value).toBe("Caretaker");
  });

  test("resolves ref-backed object fields even when the property is absent from the document", () => {
    const rootField = objectField(null, {
      owner: refField("owner", "owner#"),
    });

    const waiting = parseDocumentText({
      text: "{}",
      rootField,
    });
    expect(waiting).toEqual({
      status: "waiting-for-refs",
      missingRefs: ["owner#"],
    });

    const root = expectReady(
      parseDocumentText({
        text: "{}",
        rootField,
        resolvedRefsByRef: new Map([
          [
            "owner#",
            objectField(null, {
              title: stringField("title"),
            }),
          ],
        ]),
      }),
    ) as ObjectFieldInstance;

    const owner = root.properties.owner as RefFieldInstance;
    expect((owner.resolvedField as ObjectFieldInstance).properties.title.type).toBe("string");
  });

  test("parses inline-or-reference string and inline modes", () => {
    const rootField = objectField(null, {
      referenceOnly: inlineOrReferenceField("referenceOnly", objectField("", { name: stringField("name") })),
      inlineOnly: inlineOrReferenceField("inlineOnly", objectField("", { name: stringField("name") })),
    });

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          referenceOnly: "Items/Armor/Bronze",
          inlineOnly: {
            name: "Inline Item",
          },
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

    const referenceOnly = root.properties.referenceOnly as InlineOrReferenceFieldInstance;
    const inlineOnly = root.properties.inlineOnly as InlineOrReferenceFieldInstance;

    expect(referenceOnly.mode).toBe("string");
    expect(referenceOnly.stringValue).toBe("Items/Armor/Bronze");
    expect(inlineOnly.mode).toBe("inline");
    expect(
      ((inlineOnly.inlineValueField as ObjectFieldInstance).properties.name as StringFieldInstance).value,
    ).toBe("Inline Item");
  });

  test("preserves unknown keys and type mismatches in unparsedData", () => {
    const rootField = objectField(null, {
      name: stringField("name"),
    });

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          name: 42,
          extra: true,
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

    expect((root.properties.name as StringFieldInstance).value).toBeUndefined();
    expect((root.properties.name as StringFieldInstance).unparsedData).toBe(42);
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

    const root = expectReady(
      parseDocumentText({
        text: JSON.stringify({
          payload: rawPayload,
          timeline: [{ time: 0, value: "Idle" }],
          weighted: { Common: 2, Rare: 1 },
        }),
        rootField,
      }),
    ) as ObjectFieldInstance;

    expect((root.properties.payload as RawJsonFieldInstance).unparsedData).toEqual(rawPayload);
    expect((root.properties.timeline as TimelineFieldInstance).unparsedData).toEqual([
      { time: 0, value: "Idle" },
    ]);
    expect((root.properties.weighted as WeightedTimelineFieldInstance).unparsedData).toEqual({
      Common: 2,
      Rare: 1,
    });
  });
});
