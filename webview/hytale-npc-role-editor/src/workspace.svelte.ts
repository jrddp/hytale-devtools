import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "@shared/npc-role-editor/descriptorTypes";
import type { VSCodeApi } from "./common";
import {
  parseNpcPropertyDocument,
  type NpcPropertySection,
} from "./propertyModel";

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  descriptors = $state<NpcDescriptorDocument>([]);
  descriptorPath = $state("");
  descriptorSource = $state<NpcDescriptorSource>("default-data");

  documentPath = $state("");
  documentText = $state<string | null>(null);
  documentVersion = $state(0);
  roleType = $state<string | null>(null);
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
    this.reparseDocument();
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

  reparseDocument() {
    if (this.documentText === null) {
      this.roleType = null;
      this.propertySections = [];
      this.documentParseError = null;
      return;
    }

    const result = parseNpcPropertyDocument(this.documentText, $state.snapshot(this.descriptors));
    this.roleType = result.roleType;
    this.propertySections = result.sections;
    this.documentParseError = result.parseError;
  }
}

export const workspace = new Workspace();
