import type {
  NpcDescriptor,
  NpcDescriptorAttribute,
} from "../../../src/shared/npc-role-editor/descriptorTypes";
import type { NpcAnimationAutocompleteKind } from "../../../src/shared/npc-role-editor/animationAutocomplete";
import { resolveNpcDescriptorAssetSymbolLookup } from "../../../src/shared/npc-role-editor/assetSymbolLookup";
import type { NpcStateAutocompleteKind } from "../../../src/shared/npc-role-editor/stateAutocomplete";
import { getNpcBehaviorChildDomain } from "../../../src/shared/node-editor/npcBehaviorWorkspaceSemantics";
import type { NodeContentDefinition } from "../../../src/node-editor/workspaceDefinitionTypes";
import { normalizeDescription } from "./npcNodeWorkspaceModel";

export function buildContentField(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: NpcDescriptorAttribute,
): NodeContentDefinition | null {
  if (attribute.Type === "Parameters") {
    return null;
  }

  const enumValues = parseEnumValues(attribute.Domain);
  const type = resolveFieldType(attribute, enumValues);
  if (!type) {
    return null;
  }

  const options: NodeContentDefinition["Options"] = {
    Label: attribute.Name,
  };
  const defaultValue = parseDefaultValue(attribute);
  if (defaultValue !== undefined) {
    options.Default = defaultValue;
  }
  const inputWidth = getInputWidth(type);
  if (inputWidth !== undefined) {
    options.Width = inputWidth;
  }
  if (enumValues?.length) {
    options.Values = enumValues;
  }
  if (attribute.Computable === true) {
    options.Computable = true;
  }
  const symbolLookup = resolveNpcDescriptorAssetSymbolLookup(attribute);
  if (symbolLookup) {
    options.SymbolLookup = symbolLookup;
  }
  const stateAutocompleteKind = resolveNpcNodeFieldStateAutocompleteKind(descriptor, attribute);
  if (stateAutocompleteKind) {
    options.StateAutocompleteKind = stateAutocompleteKind;
  }
  const animationAutocompleteKind = resolveNpcNodeFieldAnimationAutocompleteKind(descriptor, attribute);
  if (animationAutocompleteKind) {
    options.AnimationAutocompleteKind = animationAutocompleteKind;
  }

  return {
    Id: attribute.Name,
    Type: type,
    Description: normalizeDescription(attribute.ShortDescription),
    Options: options,
  };
}

function resolveNpcNodeFieldStateAutocompleteKind(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: Pick<NpcDescriptorAttribute, "Name">,
): NpcStateAutocompleteKind | undefined {
  if (attribute.Name === "StartState") {
    return "role-main";
  }

  if (attribute.Name === "BusyStates") {
    return "role-full";
  }

  if (descriptor.Category === "Action" && descriptor.Name === "ParentState" && attribute.Name === "State") {
    return "component-parent-alias";
  }

  if (
    (descriptor.Category === "Action" || descriptor.Category === "Sensor") &&
    descriptor.Name === "State" &&
    attribute.Name === "State"
  ) {
    return "role-full";
  }

  return undefined;
}

function resolveNpcNodeFieldAnimationAutocompleteKind(
  descriptor: Pick<NpcDescriptor, "Category" | "Name">,
  attribute: Pick<NpcDescriptorAttribute, "Name">,
): NpcAnimationAutocompleteKind | undefined {
  if (attribute.Name !== "Animation") {
    return undefined;
  }

  if (
    (descriptor.Category === "Action" && descriptor.Name === "PlayAnimation") ||
    (descriptor.Category === "Sensor" && descriptor.Name === "Animation")
  ) {
    return "appearance-model";
  }

  return undefined;
}

export function buildReferenceField(): NodeContentDefinition {
  return {
    Id: "Reference",
    Type: "SmallString",
    Description: "Referenced component asset name.",
    Options: {
      Label: "Reference",
      Width: 220,
      Default: "",
      Computable: true,
    },
  };
}

export function buildReferenceNullableField(): NodeContentDefinition {
  return {
    Id: "Nullable",
    Type: "Checkbox",
    Description: "Allow the computed reference to resolve to no component.",
    Options: {
      Label: "Nullable",
      Default: false,
    },
  };
}

export function buildReferenceInterfacesField(): NodeContentDefinition {
  return {
    Id: "Interfaces",
    Type: "List",
    Description: "Allowed component interface codes for a computed reference.",
    Options: {
      Label: "Interfaces",
      DefaultValue: [],
      SymbolLookup: {
        indexKind: "assetDerived",
        key: "npcComponentInterfaces",
      },
    },
  };
}

function resolveFieldType(
  attribute: NpcDescriptorAttribute,
  enumValues: string[] | undefined,
): NodeContentDefinition["Type"] | null {
  if (enumValues?.length) {
    return "Enum";
  }

  switch (attribute.Type) {
    case "Boolean":
      return "Bool";
    case "Asset":
    case "Flag":
    case "String":
      return "SmallString";
    case "AssetArray":
      return "List";
    case "Float":
    case "Double":
      return "Float";
    case "Int":
    case "Integer":
    case "Long":
      return "Int";
    case "Array":
      return canRenderArrayField(attribute) ? "List" : null;
    case "ObjectRef":
      return null;
    default:
      return null;
  }
}

function canRenderArrayField(attribute: NpcDescriptorAttribute): boolean {
  return (
    getNpcBehaviorChildDomain(
      attribute.Type,
      typeof attribute.Domain === "string" ? attribute.Domain : undefined,
    ) === undefined
  );
}

function parseDefaultValue(
  attribute: NpcDescriptorAttribute,
): string | number | boolean | unknown[] | undefined {
  const rawValue = attribute.DefaultValue;
  if (rawValue == null) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return attribute.Type === "String" || attribute.Type === "Flag" ? "" : undefined;
  }

  switch (attribute.Type) {
    case "Boolean":
      if (trimmed === "true") {
        return true;
      }
      if (trimmed === "false") {
        return false;
      }
      return undefined;
    case "Float":
    case "Double":
    case "Int":
    case "Integer":
    case "Long": {
      const numericValue = Number(trimmed);
      return Number.isFinite(numericValue) ? numericValue : undefined;
    }
    case "Array":
    case "AssetArray":
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    default:
      return rawValue;
  }
}

function parseEnumValues(domain: unknown): string[] | undefined {
  if (typeof domain !== "string" || !domain.startsWith("[") || !domain.endsWith("]")) {
    return undefined;
  }

  return domain
    .slice(1, -1)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function getInputWidth(type: NodeContentDefinition["Type"]): number | undefined {
  switch (type) {
    case "Bool":
      return 18;
    case "Float":
    case "Int":
      return 88;
    case "List":
      return 240;
    default:
      return 220;
  }
}
