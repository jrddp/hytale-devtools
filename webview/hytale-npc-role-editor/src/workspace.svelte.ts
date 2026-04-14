import type {
  NpcRoleEditorWebviewToExtensionMessage,
  NpcRoleEditorApplyMessage,
  NpcRoleEditorContextActionMessage,
  NpcRoleEditorVariantReferenceState,
} from "@shared/npc-role-editor/messageTypes";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "@shared/npc-role-editor/descriptorTypes";
import type { IndexReference } from "@shared/indexTypes";
import type { VSCodeApi } from "./common";
import {
  addRichObjectArrayItem,
  addRichObjectProperty,
  addStateTransition,
  addStateTransitionEdge,
  applyNpcPropertySectionDerivedState,
  coerceFieldValueToEmptyLiteral,
  coerceLiteralValueToComputeExpression,
  buildNpcPropertyState,
  createVariantModifyOverrideFieldFromParent,
  isRichObjectField,
  isStateTransitionsField,
  reorderStateTransitionEdges,
  reorderStateTransitions,
  removeStateTransition,
  removeStateTransitionEdge,
  serializeNpcPropertyState,
  setRichObjectVariantType,
  syncStateTransitionsFieldPaths,
  syncStructuredFieldPaths,
  updateStateTransitionComment,
  updateStateTransitionEdgeEnabled,
  updateStateTransitionEdgePriority,
  updateStateTransitionEdgeStates,
  updateStateTransitionEnabled,
  type NpcFieldValue,
  type NpcPropertyField,
  type NpcPropertySection,
  type NpcPropertyState,
} from "./propertyModel";
import type { NpcComponentClass, NpcRoleJson, NpcRoleType } from "./parsing/documentTypes";
import { parseNpcDocumentText } from "./parsing/parseNpcDocument";
import { serializeNpcDocument, serializeNpcDocumentText } from "./parsing/serializeNpcDocument";
import {
  addStandardParameter,
  isStandardParameterField,
  removeStandardParameter,
  renameStandardParameter,
  reorderStandardParameters,
  updateStandardParameterDescription,
  updateStandardParameterEditorType,
} from "./parsing/parameterMutations";
import type { NpcStandardParameterEditorType } from "./parsing/parameterEditorTypes";
import {
  buildParameterUsageIndex,
  type ParameterUsageIndex,
} from "./compute/parameterUsageIndex";
import {
  buildIssuesByFieldPath,
  buildNpcIssues,
  type NpcEditorIssue,
} from "./issues";
import { discoverNpcMainStates } from "./states/discoverStates";

function emptyParameterUsageIndex(): ParameterUsageIndex {
  return {
    usagesByParameter: new Map(),
    directTranslationByFieldPath: new Map(),
  };
}

const DEFAULT_EDIT_LABEL = "Edit NPC Role";

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  isDevelopment = $state(false);
  descriptors = $state<NpcDescriptorDocument>([]);
  descriptorPath = $state("");
  descriptorSource = $state<NpcDescriptorSource>("default-data");

  documentPath = $state("");
  documentText = $state<string | null>(null);
  documentVersion = $state(0);
  roleType = $state<NpcRoleType | null>(null);
  componentClass = $state<NpcComponentClass | null>(null);
  propertySections = $state<NpcPropertySection[]>([]);
  preservedTopLevelFields = $state<Record<string, unknown>>({});
  topLevelKeyOrder = $state<string[]>([]);
  variantReferenceState = $state<NpcRoleEditorVariantReferenceState>({ status: "none" });
  variantReferenceParameters = $state<NpcPropertyField[]>([]);
  parameterUsageIndex = $state<ParameterUsageIndex>(emptyParameterUsageIndex());
  issues = $state<NpcEditorIssue[]>([]);
  issuesByFieldPath = $state<Map<string, NpcEditorIssue[]>>(new Map());
  discoveredStates = $state<string[]>([]);
  documentParseError = $state<string | null>(null);
  autocompleteField = $state<string>();
  autocompleteValues = $state<string[]>([]);
  parameterRenameRequestName = $state<string | null>(null);
  parameterRenameRequestVersion = $state(0);
  parameterDescriptionRequestName = $state<string | null>(null);
  parameterDescriptionRequestVersion = $state(0);
  parameterTypeChangeRequestName = $state<string | null>(null);
  parameterTypeChangeRequestVersion = $state(0);

  setDescriptors({
    descriptors,
    descriptorPath,
    descriptorSource,
  }: {
    descriptors: NpcDescriptorDocument;
    descriptorPath: string;
    descriptorSource: NpcDescriptorSource;
  }) {
    this.descriptors = descriptors;
    this.descriptorPath = descriptorPath;
    this.descriptorSource = descriptorSource;

    if (this.documentText !== null) {
      this.reparseDocument();
      return;
    }

    this.recomputeDerivedState();
  }

  setDevelopment(isDevelopment: boolean) {
    this.isDevelopment = isDevelopment;
  }

  buildFieldVscodeContext(fieldPath: string, extraContext: Record<string, unknown> = {}) {
    return JSON.stringify({
      webviewSection: "npcFieldRow",
      fieldPath,
      npcRoleEditorDevelopment: this.isDevelopment,
      ...extraContext,
    });
  }

  requestAutocomplete(fieldId: string, symbolLookup: IndexReference) {
    const clonedSymbolLookup = $state.snapshot(symbolLookup) as IndexReference;
    this.vscode.postMessage({
      type: "autocompleteRequest",
      fieldId,
      symbolLookup: clonedSymbolLookup,
    } satisfies NpcRoleEditorWebviewToExtensionMessage);
  }

  setAutocompleteValues(fieldId: string, values: string[]) {
    this.autocompleteField = fieldId;
    this.autocompleteValues = [...values].sort((left, right) => left.localeCompare(right));
  }

  setVariantReferenceState(reference: NpcRoleEditorVariantReferenceState) {
    const currentReferenceName = this.getCurrentVariantReferenceName();
    if (reference.referenceName && reference.referenceName !== currentReferenceName) {
      return;
    }

    let nextState = reference;
    let nextParameters: NpcPropertyField[] = [];

    if (reference.status === "loaded" && typeof reference.text === "string") {
      const result = parseNpcDocumentText(reference.text);
      if (result.status === "ready") {
        const parentState = buildNpcPropertyState({
          document: result.document,
          topLevelKeyOrder: result.topLevelKeyOrder,
          descriptors: $state.snapshot(this.descriptors),
        });
        nextParameters = parentState.sections
          .find(section => section.id === "parameters")
          ?.fields.filter(isStandardParameterField)
          .map(field => structuredClone(field)) ?? [];
      } else {
        nextState = {
          status: "error",
          referenceName: reference.referenceName,
          resolvedPath: reference.resolvedPath,
          message: result.error,
        };
      }
    }

    this.variantReferenceState = nextState;
    this.variantReferenceParameters = nextParameters;
    this.rebuildPropertyStateFromCurrentDocument();
  }

  setDocument({
    documentPath,
    text,
    version,
  }: {
    documentPath: string;
    text: string;
    version: number;
  }) {
    this.documentPath = documentPath;
    this.documentVersion = version;
    if (this.documentText === text) {
      return;
    }

    this.documentText = text;
    this.reparseDocument();
  }

  applyDocumentState(label = DEFAULT_EDIT_LABEL) {
    const document = this.getCurrentDocument();
    if (!document) {
      return;
    }

    const text = serializeNpcDocumentText(document, this.topLevelKeyOrder);
    this.documentText = text;
    const payload: NpcRoleEditorApplyMessage = {
      type: "apply",
      text,
      sourceVersion: this.documentVersion,
      label,
    };
    this.vscode.postMessage(payload satisfies NpcRoleEditorWebviewToExtensionMessage);
  }

  updateFieldValue(fieldPath: string, value: unknown) {
    const field = this.findField(fieldPath);
    if (!field) {
      return false;
    }

    field.value = {
      kind: "literal",
      value: structuredClone(value),
    };
    field.isSet = true;
    this.recomputeDerivedState();
    this.applyDocumentState(`Edit ${fieldPath}`);
    if (fieldPath === "Reference") {
      this.refreshVariantReferenceResolutionFromCurrentState();
    }
    return true;
  }

  updateFieldComputeExpression(fieldPath: string, expression: string) {
    const field = this.findField(fieldPath);
    if (!field) {
      return false;
    }

    field.value = {
      kind: "compute",
      expression,
    };
    field.isSet = true;
    this.recomputeDerivedState();
    this.applyDocumentState(`Edit ${fieldPath}`);
    if (fieldPath === "Reference") {
      this.refreshVariantReferenceResolutionFromCurrentState();
    }
    return true;
  }

  toggleFieldComputeMode(fieldPath: string) {
    const field = this.findField(fieldPath);
    if (!field || field.computable !== true) {
      return false;
    }

    field.value =
      field.value.kind === "compute"
        ? coerceFieldValueToEmptyLiteral(field)
        : {
            kind: "compute",
            expression: coerceLiteralValueToComputeExpression(field),
          };
    field.isSet = true;
    this.recomputeDerivedState();
    this.applyDocumentState();
    if (fieldPath === "Reference") {
      this.refreshVariantReferenceResolutionFromCurrentState();
    }
    return true;
  }

  unsetField(fieldPath: string) {
    const fieldLocation = this.findFieldLocation(fieldPath);
    const field = fieldLocation?.field;
    if (!field || field.canUnset === false) {
      return false;
    }

    const parametersSection = this.findSection("parameters");
    if (parametersSection && isStandardParameterField(field)) {
      const removed = removeStandardParameter(parametersSection, field.key);
      if (!removed) {
        return false;
      }
      this.recomputeDerivedState();
      this.applyDocumentState();
      return true;
    }

    const modifySection = this.findSection("modify");
    if (modifySection && field.fieldPath.startsWith("Modify.")) {
      const nextFields = modifySection.fields.filter(candidate => candidate.fieldPath !== fieldPath);
      if (nextFields.length === modifySection.fields.length) {
        return false;
      }

      modifySection.fields = nextFields;
      modifySection.keyOrder = (modifySection.keyOrder ?? []).filter(key => key !== field.key);
      this.recomputeDerivedState();
      this.applyDocumentState();
      return true;
    }

    if (fieldLocation.arrayParentField && fieldLocation.arrayIndex !== null) {
      fieldLocation.arrayParentField.childFields = (fieldLocation.arrayParentField.childFields ?? []).filter(
        (_, index) => index !== fieldLocation.arrayIndex,
      );
      syncStructuredFieldPaths(fieldLocation.arrayParentField);
      this.recomputeDerivedState();
      this.applyDocumentState();
      return true;
    }

    field.isSet = false;
    field.value = coerceFieldValueToEmptyLiteral(field);
    if (field.fieldPath === "MotionControllerList" && isRichObjectField(field)) {
      field.childFields = [];
      field.keyOrder = [];
      field.preservedData = undefined;
      field.variantType = null;
    }
    if (field.fieldPath === "StateTransitions" && isStateTransitionsField(field)) {
      field.transitions = [];
      syncStateTransitionsFieldPaths(field);
    }
    this.recomputeDerivedState();
    this.applyDocumentState();
    if (fieldPath === "Reference") {
      this.refreshVariantReferenceResolutionFromCurrentState();
    }
    return true;
  }

  addStandardParameter() {
    const section = this.findSection("parameters");
    if (!section) {
      return null;
    }

    const nextName = addStandardParameter(section);
    this.recomputeDerivedState();
    this.applyDocumentState();
    return nextName;
  }

  renameStandardParameter(currentName: string, nextName: string) {
    const section = this.findSection("parameters");
    if (!section) {
      return false;
    }

    const renamed = renameStandardParameter(section, currentName, nextName);
    if (!renamed) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStandardParameterDescription(parameterName: string, description: string) {
    const section = this.findSection("parameters");
    if (!section) {
      return false;
    }

    const updated = updateStandardParameterDescription(section, parameterName, description);
    if (!updated) {
      return false;
    }

    this.applyDocumentState();
    return true;
  }

  removeStandardParameter(parameterName: string) {
    const section = this.findSection("parameters");
    if (!section) {
      return false;
    }

    const removed = removeStandardParameter(section, parameterName);
    if (!removed) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  reorderStandardParameters(parameterNames: string[]) {
    const section = this.findSection("parameters");
    if (!section) {
      return false;
    }

    const reordered = reorderStandardParameters(section, parameterNames);
    if (!reordered) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStandardParameterEditorType(
    parameterName: string,
    editorType: NpcStandardParameterEditorType,
  ) {
    const section = this.findSection("parameters");
    if (!section) {
      return false;
    }

    const updated = updateStandardParameterEditorType(section, parameterName, editorType);
    if (!updated) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  addVariantModifyOverride(parameterName: string) {
    const modifySection = this.findSection("modify");
    const inheritedField = this.variantReferenceParameters.find(field => field.key === parameterName);
    if (!modifySection || !inheritedField || inheritedField.preservedData?.Private === true) {
      return false;
    }

    if (modifySection.fields.some(field => field.key === parameterName)) {
      return false;
    }

    const nextField = createVariantModifyOverrideFieldFromParent(inheritedField);
    const firstSpecialModifierIndex = modifySection.fields.findIndex(field => field.key.startsWith("_"));

    if (firstSpecialModifierIndex === -1) {
      modifySection.fields = [...modifySection.fields, nextField];
    } else {
      modifySection.fields = [
        ...modifySection.fields.slice(0, firstSpecialModifierIndex),
        nextField,
        ...modifySection.fields.slice(firstSpecialModifierIndex),
      ];
    }

    const nextKeyOrder = [...(modifySection.keyOrder ?? [])];
    const firstSpecialModifierKeyOrderIndex = nextKeyOrder.findIndex(key => key.startsWith("_"));
    if (firstSpecialModifierKeyOrderIndex === -1) {
      nextKeyOrder.push(parameterName);
    } else {
      nextKeyOrder.splice(firstSpecialModifierKeyOrderIndex, 0, parameterName);
    }
    modifySection.keyOrder = nextKeyOrder;

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  setRichObjectVariantType(fieldPath: string, nextType: string) {
    const field = this.findField(fieldPath);
    if (!field) {
      return false;
    }

    const updated = setRichObjectVariantType(field, nextType, $state.snapshot(this.descriptors));
    if (!updated) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  addRichObjectProperty(fieldPath: string, propertyKey: string) {
    const field = this.findField(fieldPath);
    if (!field) {
      return false;
    }

    const added = addRichObjectProperty(field, propertyKey, $state.snapshot(this.descriptors));
    if (!added) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  addRichObjectArrayItem(fieldPath: string) {
    const field = this.findField(fieldPath);
    if (!field) {
      return false;
    }

    const added = addRichObjectArrayItem(field, $state.snapshot(this.descriptors));
    if (!added) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  reorderRichObjectArray(fieldPath: string, childFieldIds: string[]) {
    const field = this.findField(fieldPath);
    if (!field || !isRichObjectField(field) || field.structureKind !== "array") {
      return false;
    }

    const childFields = field.childFields ?? [];
    const reorderedFields = childFieldIds
      .map(childFieldId => childFields.find(childField => childField.id === childFieldId))
      .filter((childField): childField is NpcPropertyField => Boolean(childField));

    if (reorderedFields.length !== childFields.length) {
      return false;
    }

    field.childFields = reorderedFields;
    syncStructuredFieldPaths(field);
    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  addTopLevelInstructionRoot(fieldPath: "InteractionInstruction" | "DeathInstruction") {
    return this.updateFieldValue(fieldPath, {
      Sensor: {
        Type: "Any",
      },
      Actions: [
        {
          Type: "Nothing",
        },
      ],
    });
  }

  addStateTransition(fieldPath: string) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const added = addStateTransition(field, $state.snapshot(this.descriptors));
    if (!added) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  removeStateTransition(fieldPath: string, transitionId: string) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const removed = removeStateTransition(field, transitionId);
    if (!removed) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  reorderStateTransitions(fieldPath: string, transitionIds: string[]) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const reordered = reorderStateTransitions(field, transitionIds);
    if (!reordered) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStateTransitionComment(fieldPath: string, transitionId: string, comment: string) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const updated = updateStateTransitionComment(field, transitionId, comment);
    if (!updated) {
      return false;
    }

    this.applyDocumentState();
    return true;
  }

  updateStateTransitionEnabled(
    fieldPath: string,
    transitionId: string,
    value: NpcFieldValue | undefined,
  ) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const updated = updateStateTransitionEnabled(field, transitionId, value);
    if (!updated) {
      return false;
    }

    this.applyDocumentState();
    return true;
  }

  addStateTransitionEdge(fieldPath: string, transitionId: string) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const added = addStateTransitionEdge(field, transitionId);
    if (!added) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  removeStateTransitionEdge(fieldPath: string, transitionId: string, edgeId: string) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const removed = removeStateTransitionEdge(field, transitionId, edgeId);
    if (!removed) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  reorderStateTransitionEdges(fieldPath: string, transitionId: string, edgeIds: string[]) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const reordered = reorderStateTransitionEdges(field, transitionId, edgeIds);
    if (!reordered) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStateTransitionEdgeStates(
    fieldPath: string,
    transitionId: string,
    edgeId: string,
    direction: "from" | "to",
    values: string[],
  ) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const updated = updateStateTransitionEdgeStates(field, transitionId, edgeId, direction, values);
    if (!updated) {
      return false;
    }

    this.recomputeDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStateTransitionEdgePriority(
    fieldPath: string,
    transitionId: string,
    edgeId: string,
    priority: number | undefined,
  ) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const updated = updateStateTransitionEdgePriority(field, transitionId, edgeId, priority);
    if (!updated) {
      return false;
    }

    this.applyDocumentState();
    return true;
  }

  updateStateTransitionEdgeEnabled(
    fieldPath: string,
    transitionId: string,
    edgeId: string,
    value: NpcFieldValue | undefined,
  ) {
    const field = this.findField(fieldPath);
    if (!field || !isStateTransitionsField(field)) {
      return false;
    }

    const updated = updateStateTransitionEdgeEnabled(field, transitionId, edgeId, value);
    if (!updated) {
      return false;
    }

    this.applyDocumentState();
    return true;
  }

  getAvailableVariantModifyOverrideFields(): NpcPropertyField[] {
    const modifySection = this.findSection("modify");
    const overriddenKeys = new Set(
      (modifySection?.fields ?? [])
        .filter(field => !field.key.startsWith("_"))
        .map(field => field.key),
    );

    return this.variantReferenceParameters.filter(
      field => field.preservedData?.Private !== true && !overriddenKeys.has(field.key),
    );
  }

  handleContextAction(message: NpcRoleEditorContextActionMessage) {
    switch (message.action) {
      case "renameParameter":
        this.parameterRenameRequestName = message.parameterName;
        this.parameterRenameRequestVersion += 1;
        return;
      case "editParameterDescription":
        this.parameterDescriptionRequestName = message.parameterName;
        this.parameterDescriptionRequestVersion += 1;
        return;
      case "changeParameterType":
        this.parameterTypeChangeRequestName = message.parameterName;
        this.parameterTypeChangeRequestVersion += 1;
        return;
      case "deleteParameter":
        if (message.parameterName) {
          this.removeStandardParameter(message.parameterName);
        }
        return;
      case "deleteField":
        if (message.fieldPath) {
          this.unsetField(message.fieldPath);
        }
        return;
      case "logFieldInstance":
        if (message.fieldPath) {
          this.logFieldInstance(message.fieldPath);
        }
        return;
      default:
        return;
    }
  }

  clearParameterRenameRequest() {
    this.parameterRenameRequestName = null;
  }

  clearParameterDescriptionRequest() {
    this.parameterDescriptionRequestName = null;
  }

  clearParameterTypeChangeRequest() {
    this.parameterTypeChangeRequestName = null;
  }

  getFieldIssues(fieldPath: string): NpcEditorIssue[] {
    return this.issuesByFieldPath.get(fieldPath) ?? [];
  }

  getStandardParameterFields(): NpcPropertyField[] {
    return (this.findSection("parameters")?.fields ?? []).filter(isStandardParameterField);
  }

  reparseDocument() {
    if (this.documentText === null) {
      this.clearDocumentState();
      return;
    }

    const result = parseNpcDocumentText(this.documentText);
    if (result.status === "error") {
      this.clearDocumentState();
      this.documentParseError = result.error;
      return;
    }

    this.rebuildPropertyStateFromParsedDocument(result.document, result.topLevelKeyOrder);
    this.documentParseError = null;
    this.recomputeDerivedState();
    this.refreshVariantReferenceResolution(result.document);
  }

  private clearDocumentState() {
    this.roleType = null;
    this.componentClass = null;
    this.propertySections = [];
    this.preservedTopLevelFields = {};
    this.topLevelKeyOrder = [];
    this.variantReferenceState = { status: "none" };
    this.variantReferenceParameters = [];
    this.parameterUsageIndex = emptyParameterUsageIndex();
    this.issues = [];
    this.issuesByFieldPath = new Map();
    this.discoveredStates = [];
    this.documentParseError = null;
  }

  private applyPropertyState(state: NpcPropertyState) {
    this.roleType = state.roleType;
    this.componentClass = state.componentClass;
    this.propertySections = state.sections;
    this.preservedTopLevelFields = state.preservedTopLevelFields;
    this.topLevelKeyOrder = [...state.topLevelKeyOrder];
  }

  private rebuildPropertyStateFromParsedDocument(
    document: NpcRoleJson,
    topLevelKeyOrder: string[],
  ) {
    const propertyState = buildNpcPropertyState({
      document,
      topLevelKeyOrder,
      descriptors: $state.snapshot(this.descriptors),
      variantReferenceParameters: this.getResolvedVariantReferenceParametersForDocument(document),
    });
    this.applyPropertyState(propertyState);
  }

  private rebuildPropertyStateFromCurrentDocument() {
    if (this.documentText === null) {
      this.clearDocumentState();
      return;
    }

    const result = parseNpcDocumentText(this.documentText);
    if (result.status === "error") {
      this.clearDocumentState();
      this.documentParseError = result.error;
      return;
    }

    this.rebuildPropertyStateFromParsedDocument(result.document, result.topLevelKeyOrder);
    this.documentParseError = null;
    this.recomputeDerivedState();
  }

  private getResolvedVariantReferenceParametersForDocument(document: NpcRoleJson): NpcPropertyField[] {
    if (document.Type !== "Variant" || typeof document.Reference !== "string") {
      return [];
    }

    const trimmedReference = document.Reference.trim();
    if (
      !trimmedReference ||
      this.variantReferenceState.status !== "loaded" ||
      this.variantReferenceState.referenceName !== trimmedReference
    ) {
      return [];
    }

    return this.variantReferenceParameters;
  }

  private recomputeDerivedState() {
    const document = this.getCurrentDocument();
    if (!document || !this.roleType) {
      this.parameterUsageIndex = emptyParameterUsageIndex();
      this.issues = [];
      this.issuesByFieldPath = new Map();
      this.discoveredStates = [];
      return;
    }

    const serializedDocument = serializeNpcDocument(document, this.topLevelKeyOrder);
    const parameterUsageIndex = buildParameterUsageIndex(serializedDocument);
    const issues = buildNpcIssues({
      roleType: this.roleType,
      sections: this.propertySections,
      parameterUsageIndex,
      variantReferenceState: this.variantReferenceState,
      variantReferenceParameters: this.variantReferenceParameters,
    });
    const issuesByFieldPath = buildIssuesByFieldPath(issues);
    const discoveredStates = discoverNpcMainStates(serializedDocument);

    applyNpcPropertySectionDerivedState(
      this.propertySections,
      parameterUsageIndex,
      discoveredStates,
    );

    this.parameterUsageIndex = parameterUsageIndex;
    this.issues = issues;
    this.issuesByFieldPath = issuesByFieldPath;
    this.discoveredStates = discoveredStates;
  }

  private getCurrentDocument(): NpcRoleJson | null {
    if (!this.roleType) {
      return null;
    }

    return serializeNpcPropertyState({
      roleType: this.roleType,
      componentClass: this.componentClass,
      sections: this.propertySections,
      preservedTopLevelFields: this.preservedTopLevelFields,
      topLevelKeyOrder: this.topLevelKeyOrder,
    });
  }

  private findSection(sectionId: NpcPropertySection["id"]): NpcPropertySection | null {
    return this.propertySections.find(section => section.id === sectionId) ?? null;
  }

  private findField(fieldPath: string): NpcPropertyField | null {
    return this.findFieldLocation(fieldPath)?.field ?? null;
  }

  private findFieldLocation(fieldPath: string): {
    field: NpcPropertyField;
    section: NpcPropertySection;
    parentField: NpcPropertyField | null;
    arrayParentField: NpcPropertyField | null;
    arrayIndex: number | null;
  } | null {
    for (const section of this.propertySections) {
      for (const field of section.fields) {
        const location = this.findFieldLocationInField(field, fieldPath, section, null, null, null);
        if (location) {
          return location;
        }
      }
    }

    return null;
  }

  private findFieldLocationInField(
    field: NpcPropertyField,
    targetFieldPath: string,
    section: NpcPropertySection,
    parentField: NpcPropertyField | null,
    arrayParentField: NpcPropertyField | null,
    arrayIndex: number | null,
  ): {
    field: NpcPropertyField;
    section: NpcPropertySection;
    parentField: NpcPropertyField | null;
    arrayParentField: NpcPropertyField | null;
    arrayIndex: number | null;
  } | null {
    if (field.fieldPath === targetFieldPath) {
      return {
        field,
        section,
        parentField,
        arrayParentField,
        arrayIndex,
      };
    }

    if (isStateTransitionsField(field)) {
      for (const transition of field.transitions ?? []) {
        const location = this.findFieldLocationInField(
          transition.actionsField,
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

    if (!isRichObjectField(field)) {
      return null;
    }

    const childFields = field.childFields ?? [];
    if (field.structureKind === "array") {
      for (const [index, childField] of childFields.entries()) {
        const location = this.findFieldLocationInField(
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
      const location = this.findFieldLocationInField(
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

  private refreshVariantReferenceResolution(document: NpcRoleJson) {
    if (document.Type !== "Variant") {
      this.variantReferenceState = { status: "none" };
      this.variantReferenceParameters = [];
      return;
    }

    if (typeof document.Reference !== "string") {
      if (document.Reference === undefined) {
        this.variantReferenceState = { status: "none" };
      } else {
        this.variantReferenceState = {
          status: "error",
          message: "Variant reference must be a static role name.",
        };
      }
      this.variantReferenceParameters = [];
      return;
    }

    const trimmedReference = document.Reference.trim();
    if (!trimmedReference) {
      this.variantReferenceState = { status: "none" };
      this.variantReferenceParameters = [];
      return;
    }

    if (
      this.variantReferenceState.status === "loading" &&
      this.variantReferenceState.referenceName === trimmedReference
    ) {
      return;
    }

    if (
      this.variantReferenceState.status === "loaded" &&
      this.variantReferenceState.referenceName === trimmedReference
    ) {
      return;
    }

    if (
      this.variantReferenceState.status === "missing" &&
      this.variantReferenceState.referenceName === trimmedReference
    ) {
      return;
    }

    if (
      this.variantReferenceState.status === "error" &&
      this.variantReferenceState.referenceName === trimmedReference
    ) {
      return;
    }

    this.variantReferenceState = {
      status: "loading",
      referenceName: trimmedReference,
    };
    this.variantReferenceParameters = [];
    this.vscode.postMessage({
      type: "resolveVariantReference",
      referenceName: trimmedReference,
    } satisfies NpcRoleEditorWebviewToExtensionMessage);
  }

  private refreshVariantReferenceResolutionFromCurrentState() {
    const document = this.getCurrentDocument();
    if (!document) {
      this.variantReferenceState = { status: "none" };
      this.variantReferenceParameters = [];
      return;
    }

    this.refreshVariantReferenceResolution(document);
    this.rebuildPropertyStateFromCurrentDocument();
  }

  private getCurrentVariantReferenceName(): string | undefined {
    const referenceField = this.findField("Reference");
    if (
      !referenceField ||
      referenceField.value.kind !== "literal" ||
      typeof referenceField.value.value !== "string"
    ) {
      return undefined;
    }

    const trimmedValue = referenceField.value.value.trim();
    return trimmedValue || undefined;
  }

  private logFieldInstance(fieldPath: string) {
    const field = this.findField(fieldPath);
    if (!field) {
      console.warn("[NPC Field Debug] Field not found.", { fieldPath });
      return;
    }

    const referencedParameters = Array.from(this.parameterUsageIndex.usagesByParameter.entries())
      .filter(([, fieldPaths]) => fieldPaths.has(field.fieldPath))
      .map(([parameterName]) => parameterName)
      .sort((left, right) => left.localeCompare(right));
    const directTranslationParameter =
      this.parameterUsageIndex.directTranslationByFieldPath.get(field.fieldPath) ?? null;
    const isParameterField = isStandardParameterField(field);
    const parameterUsages = isParameterField
      ? Array.from(this.parameterUsageIndex.usagesByParameter.get(field.key) ?? []).sort((left, right) =>
          left.localeCompare(right),
        )
      : [];
    const parameterDirectTranslations = isParameterField
      ? Array.from(this.parameterUsageIndex.directTranslationByFieldPath.entries())
          .filter(([, parameterName]) => parameterName === field.key)
          .map(([directTranslationFieldPath]) => directTranslationFieldPath)
          .sort((left, right) => left.localeCompare(right))
      : [];

    console.log("[NPC Field Debug]", {
      field: $state.snapshot(field) as NpcPropertyField,
      referencedParameters,
      directTranslationParameter,
      parameterUsages,
      parameterDirectTranslations,
    });
  }
}

export const workspace = new Workspace();
