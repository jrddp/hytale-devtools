import { describe, expect, test } from "vitest";
import {
  filterNpcRoleReferenceNamesFromPaths,
  parseNpcRoleTypeFromText,
} from "../../src/npc-role-editor/variantReferenceResolver";

describe("variant reference resolver helpers", () => {
  test("filters likely component references out of role autocomplete names", () => {
    expect(
      filterNpcRoleReferenceNamesFromPaths([
        "_Core/Templates/Template_Intelligent",
        "_Core/Components/Selectors/Component_Instruction_Generic_Search",
        "/tmp/workspace/src/main/resources/Server/NPC/Roles/Animals/Cow.json",
      ]),
    ).toEqual(["Cow", "Template_Intelligent"]);
  });

  test("parses npc role type from raw document text", () => {
    expect(parseNpcRoleTypeFromText('{\"Type\":\"Variant\",\"Reference\":\"Template_Base\"}')).toBe(
      "Variant",
    );
    expect(parseNpcRoleTypeFromText("{")).toBeUndefined();
  });
});
