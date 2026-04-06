import type {
  NpcRoleEditorWebviewToExtensionMessage,
  NpcRoleEditorApplyMessage,
} from "@shared/npc-role-editor/messageTypes";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "@shared/npc-role-editor/descriptorTypes";
import type { VSCodeApi } from "./common";
import { buildNpcPropertySections, type NpcPropertySection } from "./propertyModel";
import type { NpcDocument, NpcStandardParameterValue } from "./parsing/documentTypes";
import { parseNpcDocumentText } from "./parsing/parseNpcDocument";
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
