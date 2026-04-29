import { describe, expect, test } from "vitest";

import {
  areConnectionTypesCompatible,
  isDefaultInputHandleSchemaKey,
  isSchemaBoundInputPin,
  shouldShowInputPinLabels,
} from "../../src/shared/node-editor/pinUtils";
import { inputPin } from "./helpers";

describe("node editor pin utilities", () => {
  test("supports workspace-defined connection type ancestry", () => {
    const connectionTypesById = {
      PositionSensor: {
        extends: ["Sensor"],
        ancestors: ["Sensor"],
      },
    };

    expect(
      areConnectionTypesCompatible("PositionSensor", "Sensor", connectionTypesById),
    ).toBe(true);
    expect(
      areConnectionTypesCompatible("Sensor", "PositionSensor", connectionTypesById),
    ).toBe(false);
    expect(
      areConnectionTypesCompatible("Generic", "PositionSensor", connectionTypesById),
    ).toBe(true);
    expect(
      areConnectionTypesCompatible("PositionSensor", "Generic", connectionTypesById),
    ).toBe(true);
  });

  test("recognizes default parent input handles", () => {
    expect(isDefaultInputHandleSchemaKey("input")).toBe(true);
    expect(isDefaultInputHandleSchemaKey("input1")).toBe(true);
    expect(isDefaultInputHandleSchemaKey("input12")).toBe(true);
    expect(isDefaultInputHandleSchemaKey("Sensor")).toBe(false);
    expect(isDefaultInputHandleSchemaKey("Filters")).toBe(false);
  });

  test("distinguishes schema-bound input pins from parent compatibility pins", () => {
    expect(isSchemaBoundInputPin(inputPin("input"))).toBe(false);
    expect(isSchemaBoundInputPin(inputPin("input1"))).toBe(false);
    expect(isSchemaBoundInputPin(inputPin("Sensor"))).toBe(true);
  });

  test("only shows input labels when readability needs them", () => {
    expect(shouldShowInputPinLabels([inputPin("input")])).toBe(false);
    expect(shouldShowInputPinLabels([inputPin("Sensor", "single", { label: "Sensor" })])).toBe(
      true,
    );
    expect(
      shouldShowInputPinLabels([
        inputPin("input", "single", { label: "Sensor" }),
        inputPin("Filters", "multiple", { label: "Filters" }),
      ]),
    ).toBe(true);
  });
});
