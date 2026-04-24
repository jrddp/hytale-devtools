import { describe, expect, test } from "vitest";

import {
  addParameterMapListItem,
  coerceParameterMapValue,
  getParameterMapValueType,
  isEmptyParameterMap,
  removeParameterMapListItem,
  updateParameterMapListItem,
  updateParameterMapRangeEndpoint,
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

  test("mutates expanded string list values", () => {
    expect(addParameterMapListItem(["Idle"], "stringList")).toEqual(["Idle", ""]);
    expect(updateParameterMapListItem(["Idle", ""], "stringList", 1, "Alerted")).toEqual([
      "Idle",
      "Alerted",
    ]);
    expect(removeParameterMapListItem(["Idle", "Alerted"], "stringList", 0)).toEqual([
      "Alerted",
    ]);
  });

  test("mutates expanded number and boolean list values", () => {
    expect(addParameterMapListItem([1], "numberList")).toEqual([1, 0]);
    expect(updateParameterMapListItem([1, 0], "numberList", 1, "4")).toEqual([1, 4]);
    expect(removeParameterMapListItem([1, 4], "numberList", 0)).toEqual([4]);

    expect(addParameterMapListItem([true], "booleanList")).toEqual([true, false]);
    expect(updateParameterMapListItem([true, false], "booleanList", 1, "true")).toEqual([
      true,
      true,
    ]);
    expect(removeParameterMapListItem([true, true], "booleanList", 0)).toEqual([true]);
  });

  test("updates range endpoints without changing unsupported value preservation", () => {
    expect(updateParameterMapRangeEndpoint([1, 2], 1, 8)).toEqual([1, 8]);
    expect(updateParameterMapRangeEndpoint([], 0, 3)).toEqual([3, 0]);

    const unsupported = { Nested: true };
    expect(getParameterMapValueType(unsupported)).toBe("unsupported");
    expect(coerceParameterMapValue(unsupported, "string")).toBe("");
  });
});
