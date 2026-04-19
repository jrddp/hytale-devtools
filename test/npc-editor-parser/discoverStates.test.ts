import { describe, expect, test } from "vitest";
import { discoverNpcStates } from "../../webview/hytale-npc-role-editor/src/states/discoverStates";

describe("npc state discovery", () => {
  test("discovers main and full role states across top-level state references", () => {
    const states = discoverNpcStates({
      Type: "Generic",
      StartState: "Idle",
      BusyStates: ["Idle.Patrol", "Search"],
      StateTransitions: [
        {
          States: [
            {
              From: ["Idle", "Alerted.Chase"],
              To: ["Search"],
            },
          ],
          Actions: [],
        },
      ],
    });

    expect(states).toEqual({
      roleMainStates: ["Alerted", "Idle", "Search"],
      roleFullStates: ["Idle.Patrol", "Search"],
      componentParentAliases: [],
      componentLocalStates: [],
    });
  });

  test("resolves relative role state references against instruction sensor context", () => {
    const states = discoverNpcStates({
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
          ],
        },
      ],
    });

    expect(states).toEqual({
      roleMainStates: ["Idle"],
      roleFullStates: ["Idle", "Idle.Patrol"],
      componentParentAliases: [],
      componentLocalStates: [],
    });
  });

  test("separates component parent aliases from local component states", () => {
    const states = discoverNpcStates({
      Type: "Component",
      DefaultState: ".Evaluate",
      Parameters: {
        _ImportStates: ["Idle", "Search.Scan"],
      },
      Content: [
        {
          Type: "ParentState",
          State: "Alerted",
        },
        {
          Type: "State",
          State: ".Sleep",
        },
        {
          Modify: {
            _ExportStates: ["Search.Scan"],
          },
        },
      ],
    });

    expect(states).toEqual({
      roleMainStates: ["Search"],
      roleFullStates: ["Search.Scan"],
      componentParentAliases: ["Alerted", "Idle", "Search"],
      componentLocalStates: [".Evaluate", ".Sleep"],
    });
  });
});
