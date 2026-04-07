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
import { buildNpcPropertySections, type NpcPropertySection } from "./propertyModel";
import type {
  NpcDocument,
  NpcStandardParameterEditorType,
  NpcStandardParameterValue,
} from "./parsing/documentTypes";
import { parseNpcDocumentText } from "./parsing/parseNpcDocument";
import {
  addStandardParameter,
  removeStandardParameter,
  renameStandardParameter,
  reorderStandardParameters,
  updateStandardParameterDescription,
  updateStandardParameterEditorType,
} from "./parsing/parameterMutations";
import { serializeNpcDocument, serializeNpcDocumentText } from "./parsing/serializeNpcDocument";
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

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  descriptors = $state<NpcDescriptorDocument>([]);
  descriptorPath = $state("");
  descriptorSource = $state<NpcDescriptorSource>("default-data");

  documentPath = $state("");
  documentText = $state<string | null>(null);
  documentVersion = $state(0);
  roleType = $state<string | null>(null);
  documentModel = $state<NpcDocument | null>(null);
  propertySections = $state<NpcPropertySection[]>([]);
  parameterUsageIndex = $state<ParameterUsageIndex>({
    usagesByParameter: new Map(),
    directTranslationByFieldPath: new Map(),
  });
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
    this.refreshDerivedState();
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
    if (!this.documentModel) {
      return;
    }

    const text = serializeNpcDocumentText($state.snapshot(this.documentModel) as NpcDocument);
    this.documentText = text;
    const payload: NpcRoleEditorApplyMessage = {
      type: "apply",
      text,
      sourceVersion: this.documentVersion,
    };
    this.vscode.postMessage(payload satisfies NpcRoleEditorWebviewToExtensionMessage);
  }

  updateStandardParameterValue(parameterName: string, value: NpcStandardParameterValue) {
    const entry = this.documentModel?.parameters?.entries.find(current => current.name === parameterName);
    if (!entry) {
      return;
    }

    entry.value = value;
    this.refreshDerivedState();
    this.applyDocumentState();
  }

  toggleStandardParameterComputeMode(parameterName: string) {
    const entry = this.documentModel?.parameters?.entries.find(current => current.name === parameterName);
    if (!entry) {
      return;
    }

    if (entry.value.kind === "compute") {
      entry.value = {
        kind: "literal",
        value: entry.value.expression,
      };
    } else {
      entry.value = {
        kind: "compute",
        expression: typeof entry.value.value === "string" ? entry.value.value : "",
      };
    }

    this.refreshDerivedState();
    this.applyDocumentState();
  }

  addStandardParameter() {
    if (!this.documentModel) {
      return null;
    }

    const nextName = addStandardParameter(this.documentModel);
    this.refreshDerivedState();
    this.applyDocumentState();
    return nextName;
  }

  renameStandardParameter(currentName: string, nextName: string) {
    if (!this.documentModel?.parameters) {
      return false;
    }

    const renamed = renameStandardParameter(this.documentModel.parameters, currentName, nextName);
    if (!renamed) {
      return false;
    }

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStandardParameterDescription(parameterName: string, description: string) {
    if (!this.documentModel?.parameters) {
      return false;
    }

    const updated = updateStandardParameterDescription(
      this.documentModel.parameters,
      parameterName,
      description,
    );
    if (!updated) {
      return false;
    }

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }

  removeStandardParameter(parameterName: string) {
    if (!this.documentModel?.parameters) {
      return false;
    }

    const removed = removeStandardParameter(this.documentModel.parameters, parameterName);
    if (!removed) {
      return false;
    }

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }

  reorderStandardParameters(parameterNames: string[]) {
    if (!this.documentModel?.parameters) {
      return false;
    }

    const reordered = reorderStandardParameters(this.documentModel.parameters, parameterNames);
    if (!reordered) {
      return false;
    }

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateStandardParameterEditorType(
    parameterName: string,
    editorType: Exclude<NpcStandardParameterEditorType, "rawJson">,
  ) {
    if (!this.documentModel?.parameters) {
      return false;
    }

    const updated = updateStandardParameterEditorType(
      this.documentModel.parameters,
      parameterName,
      editorType,
    );
    if (!updated) {
      return false;
    }

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateFieldValue(fieldPath: string, value: unknown) {
    if (!this.documentModel) {
      return false;
    }

    if (fieldPath === "Parameters._ImportStates") {
      return this.updateImportStates(value);
    }

    const updated = setValueAtFieldPath(this.documentModel.rawRoot, fieldPath, structuredClone(value));
    if (!updated) {
      return false;
    }

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }

  updateFieldComputeExpression(fieldPath: string, expression: string) {
    return this.updateFieldValue(fieldPath, {
      Compute: expression,
    });
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
        this.removeStandardParameter(message.parameterName);
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

  reparseDocument() {
    if (this.documentText === null) {
      this.roleType = null;
      this.documentModel = null;
      this.propertySections = [];
      this.parameterUsageIndex = {
        usagesByParameter: new Map(),
        directTranslationByFieldPath: new Map(),
      };
      this.issues = [];
      this.issuesByFieldPath = new Map();
      this.discoveredStates = [];
      this.documentParseError = null;
      return;
    }

    const result = parseNpcDocumentText(this.documentText);

    if (result.status === "error") {
      this.roleType = null;
      this.propertySections = [];
      this.parameterUsageIndex = {
        usagesByParameter: new Map(),
        directTranslationByFieldPath: new Map(),
      };
      this.issues = [];
      this.issuesByFieldPath = new Map();
      this.discoveredStates = [];
      this.documentParseError = result.error;
      if (!this.documentModel) {
        this.documentModel = null;
      }
      return;
    }

    this.documentModel = result.document;
    this.roleType = result.document.roleType;
    this.documentParseError = null;
    this.refreshDerivedState();
  }

  private refreshDerivedState() {
    if (!this.documentModel) {
      this.roleType = null;
      this.propertySections = [];
      this.parameterUsageIndex = {
        usagesByParameter: new Map(),
        directTranslationByFieldPath: new Map(),
      };
      this.issues = [];
      this.issuesByFieldPath = new Map();
      this.discoveredStates = [];
      return;
    }

    const serializedDocument = serializeNpcDocument(
      $state.snapshot(this.documentModel) as NpcDocument,
    );
    const parameterUsageIndex = buildParameterUsageIndex(serializedDocument);
    const issues = buildNpcIssues(
      $state.snapshot(this.documentModel) as NpcDocument,
      parameterUsageIndex,
    );
    const issuesByFieldPath = buildIssuesByFieldPath(issues);
    const discoveredStates = discoverNpcMainStates(serializedDocument);
    this.roleType = this.documentModel.roleType;
    this.propertySections = buildNpcPropertySections(
      $state.snapshot(this.documentModel) as NpcDocument,
      $state.snapshot(this.descriptors),
      parameterUsageIndex,
      discoveredStates,
      issuesByFieldPath,
    );
    this.parameterUsageIndex = parameterUsageIndex;
    this.issues = issues;
    this.issuesByFieldPath = issuesByFieldPath;
    this.discoveredStates = discoveredStates;
  }

  private updateImportStates(value: unknown) {
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
      return false;
    }

    if (!this.documentModel) {
      return false;
    }

    if (!this.documentModel.parameters) {
      this.documentModel.parameters = {
        entries: [],
        importStates: [],
        excludedEntries: {},
        keyOrder: [],
      };
    }

    this.documentModel.parameters.importStates = [...value];
    delete this.documentModel.parameters.excludedEntries._ImportStates;

    if (!this.documentModel.parameters.keyOrder.includes("_ImportStates")) {
      this.documentModel.parameters.keyOrder = [
        "_ImportStates",
        ...this.documentModel.parameters.keyOrder,
      ];
    }

    if (!isRecord(this.documentModel.rawRoot.Parameters)) {
      this.documentModel.rawRoot.Parameters = {};
    }

    (this.documentModel.rawRoot.Parameters as Record<string, unknown>)._ImportStates =
      structuredClone(value);

    this.refreshDerivedState();
    this.applyDocumentState();
    return true;
  }
}

export const workspace = new Workspace();

function setValueAtFieldPath(root: Record<string, unknown>, fieldPath: string, value: unknown): boolean {
  const segments = fieldPath.split(".").filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  let current: unknown = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!isRecord(current) || !(segment in current)) {
      return false;
    }

    current = current[segment];
  }

  const lastSegment = segments.at(-1);
  if (!lastSegment || !isRecord(current)) {
    return false;
  }

  current[lastSegment] = value;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
