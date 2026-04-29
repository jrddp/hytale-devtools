import type {
  NpcRoleEditorWebviewToExtensionMessage,
  NpcRoleEditorComponentReferenceTargetState,
  NpcRoleEditorContextActionMessage,
  NpcRoleEditorVariantReferenceState,
} from "@shared/npc-role-editor/messageTypes";
import {
  getNpcAnimationAutocompleteValues,
  type NpcAnimationAutocompleteKind,
} from "@shared/npc-role-editor/animationAutocomplete";
import {
  createEmptyNpcDiscoveredStateInfo,
  getNpcStateAutocompleteValues,
  type NpcDiscoveredStateInfo,
  type NpcStateAutocompleteKind,
} from "@shared/npc-role-editor/stateAutocomplete";
import type {
  NpcDescriptorDocument,
  NpcDescriptorSource,
} from "@shared/npc-role-editor/descriptorTypes";
import type { IndexReference } from "@shared/indexTypes";
import type {
  AnimationPreviewState,
  BaseModelPreviewState,
  ModelPreviewState,
} from "@shared/modelPreviewTypes";
import type { VSCodeApi } from "./common";
import {
  beginWorkspaceAppearanceBasePreviewLoad,
  clearWorkspaceAppearancePreviewState,
  getWorkspaceAppearanceAnimationPreview,
  setWorkspaceAppearanceAnimationPreviewResult,
  setWorkspaceAppearanceBasePreviewResult,
  showWorkspaceAppearanceAnimationPreview,
} from "./workspace/appearancePreviewState";
import {
  addRichObjectArrayItem,
  addRichObjectProperty,
  coerceFieldValueToEmptyLiteral,
  coerceLiteralValueToComputeExpression,
  isRichObjectField,
  setRichObjectVariantType,
  syncStructuredFieldPaths,
  type NpcPropertyField,
  type NpcPropertySection,
} from "./propertyModel";
import type { NpcComponentClass, NpcRoleType } from "./parsing/documentTypes";
import {
  isStandardParameterField,
} from "./parsing/parameterMutations";
import type { NpcStandardParameterEditorType } from "./parsing/parameterEditorTypes";
import { type ParameterUsageIndex } from "./compute/parameterUsageIndex";
import { type NpcEditorIssue } from "./issues";
import { resolveEffectiveAppearanceAssetName } from "./appearancePreview";
import {
  addWorkspaceStandardParameter,
  addWorkspaceVariantModifyOverride,
  getAvailableWorkspaceVariantModifyOverrideFields,
  getWorkspaceStandardParameterFields,
  removeWorkspaceStandardParameter,
  renameWorkspaceStandardParameter,
  reorderWorkspaceStandardParameters,
  updateWorkspaceStandardParameterDescription,
  updateWorkspaceStandardParameterEditorType,
} from "./workspace/actions/parameterActions";
import {
  addWorkspaceRoleAttribute,
  getAvailableWorkspaceRoleAttributeFields,
} from "./workspace/actions/roleAttributeActions";
import {
  getWorkspaceComponentReferenceTarget,
  requestWorkspaceComponentReferenceTarget,
  setWorkspaceComponentReferenceTarget,
} from "./workspace/componentReferenceState";
import {
  emptyParameterUsageIndex,
  recomputeWorkspaceDerivedState,
} from "./workspace/derivedState";
import {
  applyWorkspaceDocumentState,
  flushWorkspaceDeferredDocumentState,
  reparseWorkspaceDocument,
  setWorkspaceDeferredDocument,
  setWorkspaceDocument,
} from "./workspace/documentSession";
import {
  getResolvedVariantReferenceParametersForDocument,
  getResolvedVariantReferencePreviewContext,
  refreshWorkspaceVariantReferenceResolution,
  refreshWorkspaceVariantReferenceResolutionFromCurrentState,
  setWorkspaceVariantReferenceState,
} from "./workspace/variantReferenceState";
import {
  findWorkspaceField,
  findWorkspaceFieldLocation,
  findWorkspaceSection,
} from "./workspace/fieldLookup";

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  isDevelopment = $state(false);
  descriptors = $state<NpcDescriptorDocument>([]);
  descriptorPath = $state("");
  descriptorSource = $state<NpcDescriptorSource>("default-data");

  documentPath = $state("");
  documentText = $state<string | null>(null);
  documentVersion = $state(0);
  parsedDocumentVersion = $state(0);
  hasDeferredDocumentRefresh = $state(false);
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
  discoveredStateInfo = $state<NpcDiscoveredStateInfo>(createEmptyNpcDiscoveredStateInfo());
  documentParseError = $state<string | null>(null);
  autocompleteField = $state<string>();
  autocompleteValues = $state<string[]>([]);
  indexValuesByRequestId = $state.raw<Map<string, string[]>>(new Map());
  pendingIndexValueRequestIds = $state.raw<Set<string>>(new Set());
  indexValuesVersion = $state(0);
  appearancePreview = $state<ModelPreviewState | undefined>(undefined);
  appearanceBasePreviewAssetName = $state<string | null>(null);
  appearanceBasePreview = $state<BaseModelPreviewState | undefined>(undefined);
  appearanceBasePreviewLoading = $state(false);
  appearanceActiveAnimationAssetName = $state<string | null>(null);
  appearanceActiveAnimationSetId = $state<string | null>(null);
  appearanceActiveAnimationPreview = $state<AnimationPreviewState | undefined>(undefined);
  appearanceAnimationPreviewCache = $state.raw<Map<string, AnimationPreviewState | null>>(new Map());
  appearanceFocusedAnimationOverride = $state<string | null>(null);
  appearanceAutocompleteAnimationOverride = $state<string | null>(null);
  appearanceAnimationIds = $state<string[]>([]);
  componentReferenceTargets = $state.raw<Map<string, NpcRoleEditorComponentReferenceTargetState>>(
    new Map(),
  );
  componentReferenceTargetVersion = $state(0);
  parameterRenameRequestName = $state<string | null>(null);
  parameterRenameRequestVersion = $state(0);
  parameterDescriptionRequestName = $state<string | null>(null);
  parameterDescriptionRequestVersion = $state(0);
  parameterTypeChangeRequestName = $state<string | null>(null);
  parameterTypeChangeRequestVersion = $state(0);
  graphRootSetRequestFieldPath = $state<string | null>(null);
  graphRootSetRequestNodeId = $state<string | null>(null);
  graphRootSetRequestVersion = $state(0);
  graphFieldExplicitEmptyRequestFieldPath = $state<string | null>(null);
  graphFieldExplicitEmptyRequestNodeId = $state<string | null>(null);
  graphFieldExplicitEmptyRequestSchemaKey = $state<string | null>(null);
  graphFieldExplicitEmptyRequestListItemIndex = $state<number | null>(null);
  graphFieldExplicitEmptyRequestVersion = $state(0);

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

    recomputeWorkspaceDerivedState(this);
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

  requestIndexValues(requestId: string, symbolLookup: IndexReference) {
    if (this.indexValuesByRequestId.has(requestId) || this.pendingIndexValueRequestIds.has(requestId)) {
      return;
    }

    this.pendingIndexValueRequestIds = new Set(this.pendingIndexValueRequestIds).add(requestId);
    const clonedSymbolLookup = $state.snapshot(symbolLookup) as IndexReference;
    this.vscode.postMessage({
      type: "indexValuesRequest",
      requestId,
      symbolLookup: clonedSymbolLookup,
    } satisfies NpcRoleEditorWebviewToExtensionMessage);
  }

  setIndexValues(requestId: string, values: string[]) {
    const nextValues = new Map(this.indexValuesByRequestId);
    nextValues.set(requestId, [...values].sort((left, right) => left.localeCompare(right)));
    this.indexValuesByRequestId = nextValues;
    const pendingRequestIds = new Set(this.pendingIndexValueRequestIds);
    pendingRequestIds.delete(requestId);
    this.pendingIndexValueRequestIds = pendingRequestIds;
    this.indexValuesVersion += 1;
  }

  getIndexValues(requestId: string): string[] | undefined {
    return this.indexValuesByRequestId.get(requestId);
  }

  getStateAutocompleteValues(kind: NpcStateAutocompleteKind | undefined): string[] {
    return getNpcStateAutocompleteValues(this.discoveredStateInfo, kind);
  }

  setAppearancePreview(preview: ModelPreviewState | undefined) {
    this.appearancePreview = preview;
  }

  beginAppearanceBasePreviewLoad(assetName: string | null) {
    beginWorkspaceAppearanceBasePreviewLoad(this, assetName);
  }

  clearAppearancePreviewState() {
    clearWorkspaceAppearancePreviewState(this);
  }

  setAppearanceBasePreviewResult({
    assetName,
    basePreview,
    animationIds,
    idleAnimationPreview,
  }: {
    assetName: string | null;
    basePreview?: BaseModelPreviewState;
    animationIds: string[];
    idleAnimationPreview?: AnimationPreviewState;
  }) {
    setWorkspaceAppearanceBasePreviewResult(this, {
      assetName,
      basePreview,
      animationIds,
      idleAnimationPreview,
    });
  }

  setAppearanceAnimationPreviewResult({
    assetName,
    animationSetId,
    animationPreview,
  }: {
    assetName: string;
    animationSetId: string;
    animationPreview?: AnimationPreviewState;
  }) {
    setWorkspaceAppearanceAnimationPreviewResult(this, {
      assetName,
      animationSetId,
      animationPreview,
    });
  }

  getAppearanceAnimationPreview(
    assetName: string,
    animationSetId: string,
  ): AnimationPreviewState | undefined {
    return getWorkspaceAppearanceAnimationPreview(this, assetName, animationSetId);
  }

  showAppearanceAnimationPreview(assetName: string, animationSetId: string): boolean {
    return showWorkspaceAppearanceAnimationPreview(this, assetName, animationSetId);
  }

  hasAppearanceBasePreviewForAsset(assetName: string): boolean {
    return this.appearanceBasePreviewAssetName === assetName && Boolean(this.appearanceBasePreview?.model);
  }

  setAppearanceFocusedAnimationOverride(animationSetId: string | null | undefined) {
    const trimmedAnimationSetId = animationSetId?.trim();
    this.appearanceFocusedAnimationOverride =
      trimmedAnimationSetId && trimmedAnimationSetId.length > 0 ? trimmedAnimationSetId : null;
  }

  clearAppearanceFocusedAnimationOverride() {
    this.appearanceFocusedAnimationOverride = null;
  }

  setAppearanceAutocompleteAnimationOverride(animationSetId: string | null | undefined) {
    const trimmedAnimationSetId = animationSetId?.trim();
    this.appearanceAutocompleteAnimationOverride =
      trimmedAnimationSetId && trimmedAnimationSetId.length > 0 ? trimmedAnimationSetId : null;
  }

  clearAppearanceAutocompleteAnimationOverride() {
    this.appearanceAutocompleteAnimationOverride = null;
  }

  setAppearanceAnimationValues(_assetName: string | null, values: string[]) {
    this.appearanceAnimationIds = [...values].sort((left, right) => left.localeCompare(right));
  }

  getAnimationAutocompleteValues(kind: NpcAnimationAutocompleteKind | undefined): string[] {
    return getNpcAnimationAutocompleteValues(this.appearanceAnimationIds, kind);
  }

  requestComponentReferenceTarget(componentClass: string, referenceName: string) {
    requestWorkspaceComponentReferenceTarget(this, componentClass, referenceName);
  }

  setComponentReferenceTarget(target: NpcRoleEditorComponentReferenceTargetState) {
    setWorkspaceComponentReferenceTarget(this, target);
  }

  clearExternalAssetCaches() {
    this.componentReferenceTargets = new Map();
    this.componentReferenceTargetVersion += 1;
    this.appearanceBasePreviewAssetName = null;
    this.appearanceBasePreview = undefined;
    this.appearanceAnimationPreviewCache = new Map();
    this.appearancePreview = undefined;
    this.autocompleteField = undefined;
    this.autocompleteValues = [];
    this.indexValuesByRequestId = new Map();
    this.pendingIndexValueRequestIds = new Set();
    this.indexValuesVersion += 1;
  }

  getComponentReferenceTarget(
    componentClass: string,
    referenceName: string,
  ): NpcRoleEditorComponentReferenceTargetState | undefined {
    return getWorkspaceComponentReferenceTarget(this, componentClass, referenceName);
  }

  setVariantReferenceState(reference: NpcRoleEditorVariantReferenceState) {
    setWorkspaceVariantReferenceState(this, reference);
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
    if (
      !setWorkspaceDocument(this, {
        documentPath,
        text,
        version,
      })
    ) {
      return;
    }

    this.reparseDocument();
  }

  setDeferredDocument({
    documentPath,
    text,
    version,
  }: {
    documentPath: string;
    text: string;
    version: number;
  }) {
    setWorkspaceDeferredDocument(this, {
      documentPath,
      text,
      version,
    });
  }

  flushDeferredDocumentState() {
    if (!flushWorkspaceDeferredDocumentState(this)) {
      return;
    }

    this.reparseDocument();
  }

  applyDocumentState(label = "Edit NPC Role") {
    applyWorkspaceDocumentState(this, label);
  }

  updateFieldValue(fieldPath: string, value: unknown) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
    if (!field) {
      return false;
    }

    field.value = {
      kind: "literal",
      value: structuredClone(value),
    };
    field.isSet = true;
    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState(`Edit ${fieldPath}`);
    if (fieldPath === "Reference") {
      refreshWorkspaceVariantReferenceResolutionFromCurrentState(this);
    }
    return true;
  }

  updateFieldComputeExpression(fieldPath: string, expression: string) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
    if (!field) {
      return false;
    }

    field.value = {
      kind: "compute",
      expression,
    };
    field.isSet = true;
    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState(`Edit ${fieldPath}`);
    if (fieldPath === "Reference") {
      refreshWorkspaceVariantReferenceResolutionFromCurrentState(this);
    }
    return true;
  }

  toggleFieldComputeMode(fieldPath: string) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
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
    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState();
    if (fieldPath === "Reference") {
      refreshWorkspaceVariantReferenceResolutionFromCurrentState(this);
    }
    return true;
  }

  unsetField(fieldPath: string) {
    const fieldLocation = findWorkspaceFieldLocation(this.propertySections, fieldPath);
    const field = fieldLocation?.field;
    if (!field || field.canUnset === false) {
      return false;
    }

    const parametersSection = findWorkspaceSection(this.propertySections, "parameters");
    if (parametersSection && isStandardParameterField(field)) {
      return this.removeStandardParameter(field.key);
    }

    const modifySection = findWorkspaceSection(this.propertySections, "modify");
    if (modifySection && field.fieldPath.startsWith("Modify.")) {
      const nextFields = modifySection.fields.filter(candidate => candidate.fieldPath !== fieldPath);
      if (nextFields.length === modifySection.fields.length) {
        return false;
      }

      modifySection.fields = nextFields;
      modifySection.keyOrder = (modifySection.keyOrder ?? []).filter(key => key !== field.key);
      recomputeWorkspaceDerivedState(this);
      this.applyDocumentState();
      return true;
    }

    const roleAttributesSection = findWorkspaceSection(this.propertySections, "roleAttributes");
    if (roleAttributesSection && fieldLocation.section.id === "roleAttributes" && field.required !== true) {
      const nextFields = roleAttributesSection.fields.filter(
        candidate => candidate.fieldPath !== fieldPath,
      );
      if (nextFields.length === roleAttributesSection.fields.length) {
        return false;
      }

      roleAttributesSection.fields = nextFields;
      recomputeWorkspaceDerivedState(this);
      this.applyDocumentState();
      return true;
    }

    if (fieldLocation.arrayParentField && fieldLocation.arrayIndex !== null) {
      fieldLocation.arrayParentField.childFields = (fieldLocation.arrayParentField.childFields ?? []).filter(
        (_, index) => index !== fieldLocation.arrayIndex,
      );
      syncStructuredFieldPaths(fieldLocation.arrayParentField);
      recomputeWorkspaceDerivedState(this);
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
    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState();
    if (fieldPath === "Reference") {
      refreshWorkspaceVariantReferenceResolutionFromCurrentState(this);
    }
    return true;
  }

  addStandardParameter() {
    return addWorkspaceStandardParameter(this);
  }

  renameStandardParameter(currentName: string, nextName: string) {
    return renameWorkspaceStandardParameter(this, currentName, nextName);
  }

  updateStandardParameterDescription(parameterName: string, description: string) {
    return updateWorkspaceStandardParameterDescription(this, parameterName, description);
  }

  removeStandardParameter(parameterName: string) {
    return removeWorkspaceStandardParameter(this, parameterName);
  }

  reorderStandardParameters(parameterNames: string[]) {
    return reorderWorkspaceStandardParameters(this, parameterNames);
  }

  updateStandardParameterEditorType(
    parameterName: string,
    editorType: NpcStandardParameterEditorType,
  ) {
    return updateWorkspaceStandardParameterEditorType(this, parameterName, editorType);
  }

  addVariantModifyOverride(parameterName: string) {
    return addWorkspaceVariantModifyOverride(this, parameterName);
  }

  addRoleAttribute(attributeKey: string) {
    return addWorkspaceRoleAttribute(this, attributeKey);
  }

  setRichObjectVariantType(fieldPath: string, nextType: string) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
    if (!field) {
      return false;
    }

    const updated = setRichObjectVariantType(field, nextType, $state.snapshot(this.descriptors));
    if (!updated) {
      return false;
    }

    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState();
    return true;
  }

  addRichObjectProperty(fieldPath: string, propertyKey: string) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
    if (!field) {
      return false;
    }

    const added = addRichObjectProperty(field, propertyKey, $state.snapshot(this.descriptors));
    if (!added) {
      return false;
    }

    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState();
    return true;
  }

  addRichObjectArrayItem(fieldPath: string) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
    if (!field) {
      return false;
    }

    const added = addRichObjectArrayItem(field, $state.snapshot(this.descriptors));
    if (!added) {
      return false;
    }

    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState();
    return true;
  }

  reorderRichObjectArray(fieldPath: string, childFieldIds: string[]) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
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
    recomputeWorkspaceDerivedState(this);
    this.applyDocumentState();
    return true;
  }

  addTopLevelInstructionRoot(
    fieldPath: "Instructions" | "InteractionInstruction" | "DeathInstruction",
  ) {
    const defaultInstructionRoot = {
      Sensor: {
        Type: "Any",
      },
      Actions: [
        {
          Type: "Nothing",
        },
      ],
    };

    return this.updateFieldValue(
      fieldPath,
      fieldPath === "Instructions" ? [defaultInstructionRoot] : defaultInstructionRoot,
    );
  }

  addTopLevelStateTransitionsRoot() {
    return this.updateFieldValue("StateTransitions", [
      {
        States: [
          {
            From: [],
            To: [],
          },
        ],
        Actions: [],
      },
    ]);
  }

  getAvailableVariantModifyOverrideFields(): NpcPropertyField[] {
    return getAvailableWorkspaceVariantModifyOverrideFields(this);
  }

  getAvailableRoleAttributeFields(): NpcPropertyField[] {
    return getAvailableWorkspaceRoleAttributeFields(this);
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
      case "setGraphRoot":
        if (message.fieldPath && message.nodeEditorNodeId) {
          this.graphRootSetRequestFieldPath = message.fieldPath;
          this.graphRootSetRequestNodeId = message.nodeEditorNodeId;
          this.graphRootSetRequestVersion += 1;
        }
        return;
      case "setGraphFieldExplicitEmpty":
        if (message.fieldPath && message.nodeEditorNodeId && message.nodeEditorFieldSchemaKey) {
          this.graphFieldExplicitEmptyRequestFieldPath = message.fieldPath;
          this.graphFieldExplicitEmptyRequestNodeId = message.nodeEditorNodeId;
          this.graphFieldExplicitEmptyRequestSchemaKey = message.nodeEditorFieldSchemaKey;
          this.graphFieldExplicitEmptyRequestListItemIndex =
            typeof message.nodeEditorListItemIndex === "number"
              ? message.nodeEditorListItemIndex
              : null;
          this.graphFieldExplicitEmptyRequestVersion += 1;
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
    return getWorkspaceStandardParameterFields(this);
  }

  getAppearanceField(): NpcPropertyField | null {
    return findWorkspaceField(this.propertySections, "Appearance");
  }

  getVariantAppearanceField(): NpcPropertyField | null {
    return findWorkspaceField(this.propertySections, "Modify.Appearance");
  }

  getEffectiveAppearanceAssetName(): string | undefined {
    const resolvedVariantPreviewContext = getResolvedVariantReferencePreviewContext(this);

    return resolveEffectiveAppearanceAssetName({
      roleType: this.roleType,
      appearanceField: this.getAppearanceField(),
      variantAppearanceField: this.getVariantAppearanceField(),
      parameterUsageIndex: this.parameterUsageIndex,
      standardParameterFields: this.getStandardParameterFields(),
      inheritedAppearanceValue: resolvedVariantPreviewContext?.appearanceValue,
      inheritedEffectiveParameters: resolvedVariantPreviewContext?.effectiveParameters,
    });
  }

  reparseDocument() {
    const document = reparseWorkspaceDocument(this, document =>
      getResolvedVariantReferenceParametersForDocument(this, document),
    );
    if (!document) {
      return;
    }

    refreshWorkspaceVariantReferenceResolution(this, document);
  }

  private logFieldInstance(fieldPath: string) {
    const field = findWorkspaceField(this.propertySections, fieldPath);
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
