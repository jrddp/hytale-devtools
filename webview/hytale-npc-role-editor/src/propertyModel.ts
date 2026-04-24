export type {
  NpcFieldKind,
  NpcFieldUiState,
  NpcFieldValue,
  NpcPropertyField,
  NpcPropertySection,
  NpcPropertyState,
  NpcSectionId,
  NpcSectionUiState,
} from "./propertyTypes";

export {
  cloneJsonLike,
  cloneNpcPropertyField,
  cloneOptionalFieldValue,
  coerceFieldValueToEmptyLiteral,
  coerceLiteralValueToComputeExpression,
  createDefaultParameterField,
  createVariantModifyOverrideFieldFromParent,
  getNpcFieldTypeLabel,
  getTypeHintForItemType,
  humanize,
  inferItemTypeFromPrimitiveList,
  isPrimitiveListItem,
  normalizeFlagValue,
  normalizeStringArray,
  normalizeTypeHint,
  parseOptionalBooleanFieldValue,
  serializeFieldValue,
  toOptionalDisplayString,
} from "./propertyFieldUtilities";

export {
  buildNpcPropertySections,
  buildNpcPropertyState,
  applyNpcPropertySectionDerivedState,
} from "./buildPropertyState";

export { serializeNpcPropertyState, serializeStructuredField } from "./serializePropertyState";

export {
  addRichObjectArrayItem,
  addRichObjectProperty,
  createRichObjectField,
  describeRichObjectShape,
  isContentWrapperShape,
  isRichObjectField,
  setRichObjectVariantType,
  syncStructuredFieldPaths,
} from "./structuredFields";
