import type { NpcPropertyField, NpcPropertySection } from "../propertyModel";
import { isRichObjectField } from "../propertyModel";

export type NpcFieldLocation = {
  field: NpcPropertyField;
  section: NpcPropertySection;
  parentField: NpcPropertyField | null;
  arrayParentField: NpcPropertyField | null;
  arrayIndex: number | null;
};

export function findWorkspaceSection(
  sections: NpcPropertySection[],
  sectionId: NpcPropertySection["id"],
): NpcPropertySection | null {
  return sections.find(section => section.id === sectionId) ?? null;
}

export function findWorkspaceField(
  sections: NpcPropertySection[],
  fieldPath: string,
): NpcPropertyField | null {
  return findWorkspaceFieldLocation(sections, fieldPath)?.field ?? null;
}

export function findWorkspaceFieldLocation(
  sections: NpcPropertySection[],
  fieldPath: string,
): NpcFieldLocation | null {
  for (const section of sections) {
    for (const field of section.fields) {
      const location = findWorkspaceFieldLocationInField(
        field,
        fieldPath,
        section,
        null,
        null,
        null,
      );
      if (location) {
        return location;
      }
    }
  }

  return null;
}

function findWorkspaceFieldLocationInField(
  field: NpcPropertyField,
  targetFieldPath: string,
  section: NpcPropertySection,
  parentField: NpcPropertyField | null,
  arrayParentField: NpcPropertyField | null,
  arrayIndex: number | null,
): NpcFieldLocation | null {
  if (field.fieldPath === targetFieldPath) {
    return {
      field,
      section,
      parentField,
      arrayParentField,
      arrayIndex,
    };
  }

  if (!isRichObjectField(field)) {
    return null;
  }

  const childFields = field.childFields ?? [];
  if (field.structureKind === "array") {
    for (const [index, childField] of childFields.entries()) {
      const location = findWorkspaceFieldLocationInField(
        childField,
        targetFieldPath,
        section,
        field,
        field,
        index,
      );
      if (location) {
        return location;
      }
    }
    return null;
  }

  for (const childField of childFields) {
    const location = findWorkspaceFieldLocationInField(
      childField,
      targetFieldPath,
      section,
      field,
      null,
      null,
    );
    if (location) {
      return location;
    }
  }

  return null;
}
