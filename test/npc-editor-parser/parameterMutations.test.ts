import { describe, expect, test } from "vitest";

import { parseNpcDocumentText } from "../../webview/hytale-npc-role-editor/src/parsing/parseNpcDocument";
import {
  addStandardParameter,
  removeStandardParameter,
  renameStandardParameter,
  reorderStandardParameters,
  updateStandardParameterDescription,
  updateStandardParameterEditorType,
} from "../../webview/hytale-npc-role-editor/src/parsing/parameterMutations";
import {
  buildNpcPropertyState,
  serializeNpcPropertyState,
  type NpcPropertySection,
} from "../../webview/hytale-npc-role-editor/src/propertyModel";
import { serializeNpcDocumentText } from "../../webview/hytale-npc-role-editor/src/parsing/serializeNpcDocument";
import { parseJsonText, readFixtureText } from "./helpers";

function expectReadyParametersSection(relativePath: string): {
  section: NpcPropertySection;
  topLevelKeyOrder: string[];
} {
  const result = parseNpcDocumentText(readFixtureText(relativePath));
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(result.error);
  }

  const state = buildNpcPropertyState({
    document: result.document,
    topLevelKeyOrder: result.topLevelKeyOrder,
    descriptors: [],
  });
  const section = state.sections.find(section => section.id === "parameters");
  if (!section) {
    throw new Error("Expected parameters section");
  }

  return {
    section,
    topLevelKeyOrder: state.topLevelKeyOrder,
  };
}

function serializeSection(section: NpcPropertySection, topLevelKeyOrder: string[]) {
  return parseJsonText(
    serializeNpcDocumentText(
      serializeNpcPropertyState({
        roleType: "Generic",
        componentClass: null,
        sections: [section],
        preservedTopLevelFields: {},
        topLevelKeyOrder,
      }),
      topLevelKeyOrder,
    ),
  ) as Record<string, unknown>;
}

describe("npc editor parameter mutations", () => {
  test("adds a new standard parameter with a unique default name", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    const nextName = addStandardParameter(section);
    const serialized = serializeSection(section, topLevelKeyOrder);
    const parameters = serialized.Parameters as Record<string, unknown>;

    expect(nextName).toBe("Parameter");
    expect(parameters.Parameter).toEqual({
      Value: "",
    });
  });

  test("renames a standard parameter while preserving its serialized payload", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    const renamed = renameStandardParameter(section, "Invulnerable", "Immortal");
    const serialized = serializeSection(section, topLevelKeyOrder);
    const serializedParameters = serialized.Parameters as Record<string, unknown>;

    expect(renamed).toBe(true);
    expect(serializedParameters.Immortal).toEqual({
      Value: false,
      Description: "Whether this NPC is invulnerable.",
    });
    expect(serializedParameters.Invulnerable).toBeUndefined();
  });

  test("removes a standard parameter", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    const removed = removeStandardParameter(section, "Invulnerable");
    const serialized = serializeSection(section, topLevelKeyOrder);
    const serializedParameters = serialized.Parameters as Record<string, unknown>;

    expect(removed).toBe(true);
    expect(serializedParameters.Invulnerable).toBeUndefined();
  });

  test("reorders standard parameters while preserving excluded entry positions", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/_Core/Components/Selectors/Component_Instruction_Generic_Idle.json",
    );

    const orderedNames = [
      "MotionComponent",
      "ViewRange",
      "ViewSector",
      "HearingRange",
      "AlertedRange",
      "SearchedForAttitudes",
    ];

    const reordered = reorderStandardParameters(section, orderedNames);
    const serialized = parseJsonText(
      serializeNpcDocumentText(
        serializeNpcPropertyState({
          roleType: "Component",
          componentClass: "Instruction",
          sections: [section],
          preservedTopLevelFields: {},
          topLevelKeyOrder,
        }),
        topLevelKeyOrder,
      ),
    ) as Record<string, unknown>;
    const parameterKeys = Object.keys(serialized.Parameters as Record<string, unknown>);

    expect(reordered).toBe(true);
    expect(parameterKeys).toEqual(["_ImportStates", ...orderedNames]);
  });

  test("switches parameter type and writes matching value/type hint", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    expect(updateStandardParameterEditorType(section, "Invulnerable", "numberList")).toBe(true);

    let serialized = serializeSection(section, topLevelKeyOrder);
    let invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable).toEqual({
      Value: [0],
      Description: "Whether this NPC is invulnerable.",
    });

    expect(updateStandardParameterEditorType(section, "Invulnerable", "range")).toBe(true);

    serialized = serializeSection(section, topLevelKeyOrder);
    invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable.TypeHint).toBeUndefined();
    expect(invulnerable.Value).toEqual([0, 0]);
  });

  test("switches a parameter to compute mode", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    expect(updateStandardParameterEditorType(section, "Invulnerable", "compute")).toBe(true);

    const serialized = serializeSection(section, topLevelKeyOrder);
    const invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable).toEqual({
      Value: {
        Compute: "false",
      },
      Description: "Whether this NPC is invulnerable.",
    });
  });

  test("updates and clears a parameter description", () => {
    const { section, topLevelKeyOrder } = expectReadyParametersSection(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    expect(updateStandardParameterDescription(section, "Invulnerable", "Cannot take damage.")).toBe(
      true,
    );

    let serialized = serializeSection(section, topLevelKeyOrder);
    let invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable.Description).toBe("Cannot take damage.");

    expect(updateStandardParameterDescription(section, "Invulnerable", "")).toBe(true);

    serialized = serializeSection(section, topLevelKeyOrder);
    invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable.Description).toBeUndefined();
  });
});
