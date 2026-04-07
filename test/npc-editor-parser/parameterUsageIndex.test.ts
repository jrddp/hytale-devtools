import { describe, expect, test } from "vitest";
import { buildParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";

describe("npc parameter usage index", () => {
  test("collects referenced parameters and direct translations across the document", () => {
    const usageIndex = buildParameterUsageIndex({
      Type: "Generic",
      Appearance: { Compute: "Appearance" },
      MaxRange: { Compute: "max(ViewRange, PI)" },
      Parameters: {
        LinkedName: {
          Value: { Compute: "DisplayName" },
        },
      },
    });

    expect(usageIndex.usagesByParameter.get("Appearance")).toEqual(new Set(["Appearance"]));
    expect(usageIndex.usagesByParameter.get("ViewRange")).toEqual(new Set(["MaxRange"]));
    expect(usageIndex.usagesByParameter.get("DisplayName")).toEqual(
      new Set(["Parameters.LinkedName.Value"]),
    );
    expect(usageIndex.usagesByParameter.has("max")).toBe(false);
    expect(usageIndex.usagesByParameter.has("PI")).toBe(false);

    expect(usageIndex.directTranslationByFieldPath).toEqual(
      new Map([
        ["Appearance", "Appearance"],
        ["Parameters.LinkedName.Value", "DisplayName"],
      ]),
    );
  });

  test("ignores identifiers that only appear inside quoted strings", () => {
    const usageIndex = buildParameterUsageIndex({
      Description: { Compute: 'isEmpty("Appearance")' },
    });

    expect(usageIndex.usagesByParameter.size).toBe(0);
    expect(usageIndex.directTranslationByFieldPath.size).toBe(0);
  });
});
