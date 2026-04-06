import type {
  NpcRoleEditorWebviewToExtensionMessage,
  NpcRoleEditorApplyMessage,
  NpcRoleEditorContextActionMessage,
} from "@shared/npc-role-editor/messageTypes";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "@shared/npc-role-editor/descriptorTypes";
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
  updateStandardParameterEditorType,
} from "./parsing/parameterMutations";
import { serializeNpcDocumentText } from "./parsing/serializeNpcDocument";

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
  documentParseError = $state<string | null>(null);
  parameterRenameRequestName = $state<string | null>(null);
  parameterRenameRequestVersion = $state(0);
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
    this.refreshPropertySections();
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
    this.documentText = text;
    this.documentVersion = version;
    this.reparseDocument();
  }

  applyDocumentState() {
    if (!this.documentModel) {
      return;
    }

    const payload: NpcRoleEditorApplyMessage = {
      type: "apply",
      text: serializeNpcDocumentText($state.snapshot(this.documentModel) as NpcDocument),
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
    this.refreshPropertySections();
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

    this.refreshPropertySections();
    this.applyDocumentState();
  }

  addStandardParameter() {
    if (!this.documentModel) {
      return null;
    }

    const nextName = addStandardParameter(this.documentModel);
    this.refreshPropertySections();
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

    this.refreshPropertySections();
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

    this.refreshPropertySections();
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

    this.refreshPropertySections();
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

    this.refreshPropertySections();
    this.applyDocumentState();
    return true;
  }

  handleContextAction(message: NpcRoleEditorContextActionMessage) {
    switch (message.action) {
      case "renameParameter":
        this.parameterRenameRequestName = message.parameterName;
        this.parameterRenameRequestVersion += 1;
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

  clearParameterTypeChangeRequest() {
    this.parameterTypeChangeRequestName = null;
  }

  reparseDocument() {
    if (this.documentText === null) {
      this.roleType = null;
      this.documentModel = null;
      this.propertySections = [];
      this.documentParseError = null;
      return;
    }

    const result = parseNpcDocumentText(this.documentText);

    if (result.status === "error") {
      this.roleType = null;
      this.propertySections = [];
      this.documentParseError = result.error;
      if (!this.documentModel) {
        this.documentModel = null;
      }
      return;
    }

    this.documentModel = result.document;
    this.roleType = result.document.roleType;
    this.documentParseError = null;
    this.refreshPropertySections();
  }

  private refreshPropertySections() {
    if (!this.documentModel) {
      this.roleType = null;
      this.propertySections = [];
      return;
    }

    this.roleType = this.documentModel.roleType;
    this.propertySections = buildNpcPropertySections(
      $state.snapshot(this.documentModel) as NpcDocument,
      $state.snapshot(this.descriptors),
    );
  }
}

export const workspace = new Workspace();
