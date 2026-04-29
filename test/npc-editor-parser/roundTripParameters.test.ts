import { describe, expect, test } from "vitest";

import { parseNpcDocumentText } from "../../webview/hytale-npc-role-editor/src/parsing/parseNpcDocument";
import {
  serializeNpcDocumentText,
  serializeStandardParameterValue,
} from "../../webview/hytale-npc-role-editor/src/parsing/serializeNpcDocument";
import { canonicalizeJson, parseJsonText, readFixtureText } from "./helpers";

type Fixture = {
  label: string;
  path: string;
};

const FIXTURES: Fixture[] = [
  {
    label: "Generic",
    path: "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
  },
  {
    label: "Abstract",
    path: "Server/NPC/Roles/_Core/Templates/Template_Edible_Critter.json",
  },
  {
    label: "Variant",
    path: "Server/NPC/Roles/Undead/Skeleton/Skeleton/Skeleton_Scout.json",
  },
  {
    label: "Component",
    path: "Server/NPC/Roles/_Core/Components/Sensors/Component_Sensor_Day.json",
  },
];

describe("npc editor standard parameter round-trip", () => {
  test.each(FIXTURES)("$label parameters round-trip without structural drift", ({ path }) => {
    const sourceText = readFixtureText(path);
    const result = parseNpcDocumentText(sourceText);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(result.error);
    }

    const serialized = serializeNpcDocumentText(result.document);

    expect(canonicalizeJson(parseJsonText(serialized))).toEqual(
      canonicalizeJson(parseJsonText(sourceText)),
    );
  });

  test("serializes compute-shaped standard parameter values", () => {
    const sourceText = readFixtureText(
      "Server/NPC/Roles/Intelligent/Neutral/Kweebec/Kweebec_Merchant.json",
    );
    const result = parseNpcDocumentText(sourceText);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(result.error);
    }

    const sourceParameters = result.document.Parameters as Record<string, unknown> | undefined;
    if (
      sourceParameters &&
      typeof sourceParameters.Invulnerable === "object" &&
      sourceParameters.Invulnerable !== null
    ) {
      (sourceParameters.Invulnerable as Record<string, unknown>).Value = {
        Compute: "InvulnerableOverride",
      };
    }

    const serialized = parseJsonText(serializeNpcDocumentText(result.document)) as Record<
      string,
      unknown
    >;
    const parameters = serialized.Parameters as Record<string, unknown>;
    const invulnerable = parameters.Invulnerable as Record<string, unknown>;

    expect(invulnerable.Value).toEqual(
      serializeStandardParameterValue({
        kind: "compute",
        expression: "InvulnerableOverride",
      }),
    );
  });

  test("preserves excluded special parameter entries while editing standard ones", () => {
    const sourceText = readFixtureText(
      "Server/NPC/Roles/_Core/Components/Selectors/Component_Instruction_Generic_Idle.json",
    );
    const result = parseNpcDocumentText(sourceText);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(result.error);
    }

    const parametersObject = result.document.Parameters as Record<string, unknown> | undefined;
    const alertRadius = parametersObject?.AlertedRange;
    expect(alertRadius).toBeDefined();
    if (alertRadius && typeof alertRadius === "object" && alertRadius !== null) {
      (alertRadius as Record<string, unknown>).Value = 42;
    }

    const serialized = parseJsonText(serializeNpcDocumentText(result.document)) as Record<
      string,
      unknown
    >;
    const parameters = serialized.Parameters as Record<string, unknown>;

    expect(parameters._ImportStates).toEqual(
      (parseJsonText(sourceText) as Record<string, unknown>).Parameters &&
        ((parseJsonText(sourceText) as Record<string, unknown>).Parameters as Record<string, unknown>)
          ._ImportStates,
    );
    expect((parameters.AlertedRange as Record<string, unknown>).Value).toBe(42);
  });
});
