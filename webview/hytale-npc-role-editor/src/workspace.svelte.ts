import type {
  NpcRoleEditorWebviewToExtensionMessage,
  NpcRoleEditorApplyMessage,
  NpcRoleEditorContextActionMessage,
} from "@shared/npc-role-editor/messageTypes";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "@shared/npc-role-editor/descriptorTypes";
import type { IndexReference } from "@shared/indexTypes";
import type { VSCodeApi } from "./common";
import {
  applyNpcPropertySectionDerivedState,
  coerceFieldValueToEmptyLiteral,
  coerceLiteralValueToComputeExpression,
  buildNpcPropertyState,
  serializeNpcPropertyState,
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

  applyDocumentState() {
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
    this.applyDocumentState();
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
    this.applyDocumentState();
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
    return true;
  }

  unsetField(fieldPath: string) {
    const field = this.findField(fieldPath);
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

    field.isSet = false;
    field.value = coerceFieldValueToEmptyLiteral(field);
    this.recomputeDerivedState();
    this.applyDocumentState();
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

    const propertyState = buildNpcPropertyState({
      document: result.document,
      topLevelKeyOrder: result.topLevelKeyOrder,
      descriptors: $state.snapshot(this.descriptors),
    });
    this.applyPropertyState(propertyState);
    this.documentParseError = null;
    this.recomputeDerivedState();
  }

  private clearDocumentState() {
    this.roleType = null;
    this.componentClass = null;
    this.propertySections = [];
    this.preservedTopLevelFields = {};
    this.topLevelKeyOrder = [];
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
    for (const section of this.propertySections) {
      for (const field of section.fields) {
        if (field.fieldPath === fieldPath) {
          return field;
        }
      }
    }

    return null;
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
