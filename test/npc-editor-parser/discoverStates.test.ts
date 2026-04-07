import { describe, expect, test } from "vitest";
import { discoverNpcMainStates } from "../../webview/hytale-npc-role-editor/src/states/discoverStates";

describe("npc state discovery", () => {
  test("discovers unique main states across top-level state references", () => {
    const states = discoverNpcMainStates({
      Type: "Generic",
      StartState: "Idle",
      BusyStates: ["Idle.Patrol", "Search"],
      StateTransitions: {
        States: [
          {
            From: ["Idle", "Alerted.Chase"],
            To: ["Search"],
          },
        ],
      },
    });

    expect(states).toEqual(["Alerted", "Idle", "Search"]);
  });

  test("resolves relative state references against instruction sensor context", () => {
    const states = discoverNpcMainStates({
      Type: "Generic",
      Instructions: [
        {
          Sensor: {
            Type: "State",
            State: "Idle",
          },
          Actions: [
            {
              Type: "State",
              State: ".Patrol",
            },
            {
              Type: "ParentState",
              State: ".Alerted",
            },
          ],
        },
      ],
    });

    expect(states).toEqual(["Idle"]);
  });

  test("includes import and export state mappings as main-state suggestions", () => {
    const states = discoverNpcMainStates({
      Type: "Component",
      Parameters: {
        _ImportStates: ["Idle", "Search.Scan"],
      },
      Content: [
        {
          Modify: {
            _ExportStates: ["Alerted.Chase"],
          },
        },
      ],
    });

    expect(states).toEqual(["Alerted", "Idle", "Search"]);
  });
});
