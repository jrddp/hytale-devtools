import { describe, expect, test } from "vitest";

import {
  coerceParameterMapValue,
  getParameterMapValueType,
  isEmptyParameterMap,
} from "../../src/shared/node-editor/parameterMap";

describe("node-editor parameter maps", () => {
  test("classifies supported builder-expression values", () => {
    expect(getParameterMapValueType("State")).toBe("string");
    expect(getParameterMapValueType(3)).toBe("number");
    expect(getParameterMapValueType(false)).toBe("boolean");
    expect(getParameterMapValueType([1, 2])).toBe("range");
    expect(getParameterMapValueType([1, 2, 3])).toBe("numberList");
    expect(getParameterMapValueType(["A", "B"])).toBe("stringList");
    expect(getParameterMapValueType([true, false])).toBe("booleanList");
    expect(getParameterMapValueType({ Compute: "Range" })).toBe("compute");
    expect(getParameterMapValueType(["A", 2])).toBe("unsupported");
    expect(getParameterMapValueType({ Nested: true })).toBe("unsupported");
  });

  test("coerces values when changing parameter map row types", () => {
    expect(coerceParameterMapValue("12", "number")).toBe(12);
    expect(coerceParameterMapValue("true", "boolean")).toBe(true);
    expect(coerceParameterMapValue(4, "range")).toEqual([4, 4]);
    expect(coerceParameterMapValue("Idle", "stringList")).toEqual(["Idle"]);
    expect(coerceParameterMapValue(["1", 2], "numberList")).toEqual([1, 2]);
    expect(coerceParameterMapValue(["true", false], "booleanList")).toEqual([true, false]);
    expect(coerceParameterMapValue(["Idle", "Alerted"], "compute")).toEqual({
      Compute: "[\"Idle\",\"Alerted\"]",
    });
  });

  test("detects empty maps for serialization pruning", () => {
    expect(isEmptyParameterMap({})).toBe(true);
    expect(isEmptyParameterMap({ Range: 6 })).toBe(false);
    expect(isEmptyParameterMap(["not", "a", "map"])).toBe(true);
  });
});
