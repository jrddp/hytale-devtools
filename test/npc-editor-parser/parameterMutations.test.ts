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
import { serializeNpcDocumentText } from "../../webview/hytale-npc-role-editor/src/parsing/serializeNpcDocument";
import { parseJsonText, readFixtureText } from "./helpers";

function expectReadyDocument(relativePath: string) {
  const result = parseNpcDocumentText(readFixtureText(relativePath));
  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error(result.error);
  }
  return result.document;
}

describe("npc editor parameter mutations", () => {
  test("adds a new standard parameter with a unique default name", () => {
    const document = expectReadyDocument(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );

    const nextName = addStandardParameter(document);
    const serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    const parameters = serialized.Parameters as Record<string, unknown>;

    expect(nextName).toBe("Parameter");
    expect(parameters.Parameter).toEqual({
      Value: "",
    });
  });

  test("renames a standard parameter while preserving its serialized payload", () => {
    const document = expectReadyDocument(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );
    const parameters = document.parameters;
    expect(parameters).not.toBeNull();
    if (!parameters) {
      throw new Error("Expected parameters to exist");
    }

    const renamed = renameStandardParameter(parameters, "Invulnerable", "Immortal");
    const serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    const serializedParameters = serialized.Parameters as Record<string, unknown>;

    expect(renamed).toBe(true);
    expect(serializedParameters.Immortal).toEqual({
      Value: false,
      Description: "Whether this NPC is invulnerable.",
    });
    expect(serializedParameters.Invulnerable).toBeUndefined();
  });

  test("removes a standard parameter", () => {
    const document = expectReadyDocument(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );
    const parameters = document.parameters;
    expect(parameters).not.toBeNull();
    if (!parameters) {
      throw new Error("Expected parameters to exist");
    }

    const removed = removeStandardParameter(parameters, "Invulnerable");
    const serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    const serializedParameters = serialized.Parameters as Record<string, unknown>;

    expect(removed).toBe(true);
    expect(serializedParameters.Invulnerable).toBeUndefined();
  });

  test("reorders standard parameters while preserving excluded entry positions", () => {
    const document = expectReadyDocument(
      "Server/NPC/Roles/_Core/Components/Selectors/Component_Instruction_Generic_Idle.json",
    );
    const parameters = document.parameters;
    expect(parameters).not.toBeNull();
    if (!parameters) {
      throw new Error("Expected parameters to exist");
    }

    const orderedNames = [
      "MotionComponent",
      "ViewRange",
      "ViewSector",
      "HearingRange",
      "AlertedRange",
      "SearchedForAttitudes",
    ];

    const reordered = reorderStandardParameters(parameters, orderedNames);
    const serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    const parameterKeys = Object.keys(serialized.Parameters as Record<string, unknown>);

    expect(reordered).toBe(true);
    expect(parameterKeys).toEqual([
      "_ImportStates",
      ...orderedNames,
    ]);
  });

  test("switches parameter type and writes matching value/type hint", () => {
    const document = expectReadyDocument(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );
    const parameters = document.parameters;
    expect(parameters).not.toBeNull();
    if (!parameters) {
      throw new Error("Expected parameters to exist");
    }

    expect(updateStandardParameterEditorType(parameters, "Invulnerable", "numberList")).toBe(true);

    let serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    let invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable).toEqual({
      Value: [0],
      Description: "Whether this NPC is invulnerable.",
      TypeHint: "Number",
    });

    expect(updateStandardParameterEditorType(parameters, "Invulnerable", "range")).toBe(true);

    serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable.TypeHint).toBe("Number");
    expect(invulnerable.Value).toEqual([0, 0]);
  });

  test("switches a parameter to compute mode", () => {
    const document = expectReadyDocument(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );
    const parameters = document.parameters;
    expect(parameters).not.toBeNull();
    if (!parameters) {
      throw new Error("Expected parameters to exist");
    }

    expect(updateStandardParameterEditorType(parameters, "Invulnerable", "compute")).toBe(true);

    const serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
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
    const document = expectReadyDocument(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );
    const parameters = document.parameters;
    expect(parameters).not.toBeNull();
    if (!parameters) {
      throw new Error("Expected parameters to exist");
    }

    expect(updateStandardParameterDescription(parameters, "Invulnerable", "Cannot take damage.")).toBe(
      true,
    );

    let serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    let invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable.Description).toBe("Cannot take damage.");

    expect(updateStandardParameterDescription(parameters, "Invulnerable", "")).toBe(true);

    serialized = parseJsonText(serializeNpcDocumentText(document)) as Record<string, unknown>;
    invulnerable = (serialized.Parameters as Record<string, unknown>)
      .Invulnerable as Record<string, unknown>;

    expect(invulnerable.Description).toBeUndefined();
  });
});
