import { FIELD_TYPES } from './types.js';
import { buildFieldValueMap } from './fieldValueUtils.js';

function createTemplate(definition) {
  return {
    ...definition,
    inputPins: Array.isArray(definition.inputPins) ? definition.inputPins : [],
    outputPins: Array.isArray(definition.outputPins) ? definition.outputPins : [],
    schemaConnections: Array.isArray(definition.schemaConnections)
      ? definition.schemaConnections
      : [],
    buildInitialValues: () => buildFieldValueMap(definition.fields),
  };
}

export const SAMPLE_NODE_TEMPLATES = [
  createTemplate({
    templateId: 'simple',
    label: 'Simple Node',
    category: 'Basics',
    defaultTypeName: 'Simple',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
    ],
    outputPins: [
      { id: 'next', type: 'Flow', label: 'Next' },
    ],
    schemaConnections: [
      {
        schemaKey: 'NextNode',
        outputPinId: 'next',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
    ],
    fields: [
      {
        id: 'Label',
        type: FIELD_TYPES.SMALL_STRING,
        label: 'Label',
        options: { Label: 'Label', Default: 'Simple Node', Width: 220 },
      },
      {
        id: 'Subtitle',
        type: FIELD_TYPES.STRING,
        label: 'Subtitle',
        options: { Label: 'Subtitle', Default: 'Basic custom node', Width: 220, Height: 60 },
      },
    ],
  }),
  createTemplate({
    templateId: 'text',
    label: 'Text Node',
    category: 'Basics',
    defaultTypeName: 'Text',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'context', type: 'Data', label: 'Context' },
    ],
    outputPins: [
      { id: 'success', type: 'Flow', label: 'Success' },
      { id: 'failure', type: 'Flow', label: 'Failure' },
    ],
    schemaConnections: [
      {
        schemaKey: 'SuccessNode',
        outputPinId: 'success',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'FailureNode',
        outputPinId: 'failure',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
    ],
    fields: [
      {
        id: 'Headline',
        type: FIELD_TYPES.SMALL_STRING,
        label: 'Headline',
        options: { Label: 'Headline', Default: 'Untitled' },
      },
      {
        id: 'Body',
        type: FIELD_TYPES.STRING,
        label: 'Body',
        options: { Label: 'Body', Default: 'Write notes here...', Height: 80, Width: 260 },
      },
    ],
  }),
  createTemplate({
    templateId: 'numbers',
    label: 'Number Node',
    category: 'Controls',
    defaultTypeName: 'Number',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'value', type: 'Number', label: 'Value' },
    ],
    outputPins: [
      { id: 'next', type: 'Flow', label: 'Next' },
      { id: 'inputs', type: 'Number', label: 'Inputs', multiple: true },
    ],
    schemaConnections: [
      {
        schemaKey: 'NextNode',
        outputPinId: 'next',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'InputNodes',
        outputPinId: 'inputs',
        outputPinType: 'Number',
        nodeSelector: 'DevNode',
        multiple: true,
      },
    ],
    fields: [
      {
        id: 'Quantity',
        type: FIELD_TYPES.INT,
        label: 'Quantity',
        options: { Label: 'Quantity', Default: 10, SmallChange: 1, LargeChange: 5 },
      },
      {
        id: 'Maximum',
        type: FIELD_TYPES.INTEGER,
        label: 'Maximum',
        options: { Label: 'Maximum', Default: 100, Width: 100 },
      },
      {
        id: 'Scale',
        type: FIELD_TYPES.FLOAT,
        label: 'Scale',
        options: { Label: 'Scale', Default: 1.25, Width: 100 },
      },
    ],
  }),
  createTemplate({
    templateId: 'slider',
    label: 'Slider Node',
    category: 'Controls',
    defaultTypeName: 'Slider',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'source', type: 'Number', label: 'Source' },
    ],
    outputPins: [
      { id: 'value', type: 'Number', label: 'Value' },
      { id: 'next', type: 'Flow', label: 'Next' },
      { id: 'listeners', type: 'Flow', label: 'Listeners', multiple: true },
    ],
    schemaConnections: [
      {
        schemaKey: 'ValueNode',
        outputPinId: 'value',
        outputPinType: 'Number',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'NextNode',
        outputPinId: 'next',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'ListenerNodes',
        outputPinId: 'listeners',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: true,
      },
    ],
    fields: [
      {
        id: 'Strength',
        type: FIELD_TYPES.INT_SLIDER,
        label: 'Strength',
        options: { Label: 'Strength', Default: 45, Min: 0, Max: 100, TickFrequency: 5, Width: 220 },
      },
    ],
  }),
  createTemplate({
    templateId: 'toggles',
    label: 'Toggle Node',
    category: 'Controls',
    defaultTypeName: 'Toggle',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'condition', type: 'Bool', label: 'Condition' },
    ],
    outputPins: [
      { id: 'onTrue', type: 'Flow', label: 'On True' },
      { id: 'onFalse', type: 'Flow', label: 'On False' },
    ],
    schemaConnections: [
      {
        schemaKey: 'TrueNode',
        outputPinId: 'onTrue',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'FalseNode',
        outputPinId: 'onFalse',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
    ],
    fields: [
      {
        id: 'Enabled',
        type: FIELD_TYPES.CHECKBOX,
        label: 'Enabled',
        options: { Label: 'Enabled', Default: true },
      },
      {
        id: 'Verbose',
        type: FIELD_TYPES.BOOL,
        label: 'Verbose',
        options: { Label: 'Verbose', DefaultValue: false },
      },
      {
        id: 'Mode',
        type: FIELD_TYPES.ENUM,
        label: 'Mode',
        options: {
          Label: 'Mode',
          Default: 'Balanced',
          Values: ['Fast', 'Balanced', 'Accurate'],
          Width: 180,
        },
      },
    ],
  }),
  createTemplate({
    templateId: 'assets',
    label: 'Asset Node',
    category: 'Data',
    defaultTypeName: 'Asset',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'asset', type: 'Asset', label: 'Asset In' },
    ],
    outputPins: [
      { id: 'next', type: 'Flow', label: 'Next' },
      { id: 'assetOut', type: 'Asset', label: 'Asset Out' },
      { id: 'tags', type: 'String', label: 'Tags', multiple: true },
    ],
    schemaConnections: [
      {
        schemaKey: 'NextNode',
        outputPinId: 'next',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'AssetNode',
        outputPinId: 'assetOut',
        outputPinType: 'Asset',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'TagNodes',
        outputPinId: 'tags',
        outputPinType: 'String',
        nodeSelector: 'DevNode',
        multiple: true,
      },
    ],
    fields: [
      {
        id: 'AssetPath',
        type: FIELD_TYPES.FILE_PATH,
        label: 'Asset Path',
        options: { Label: 'Asset Path', Default: 'resources/my_asset.json', Width: 260, UseUUID: false },
      },
      {
        id: 'Tags',
        type: FIELD_TYPES.LIST,
        label: 'Tags',
        options: { Label: 'Tags', Type: FIELD_TYPES.STRING, Width: 220 },
      },
    ],
  }),
  createTemplate({
    templateId: 'object',
    label: 'Object Node',
    category: 'Data',
    defaultTypeName: 'ObjectNode',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'objectIn', type: 'Data', label: 'Object In' },
    ],
    outputPins: [
      { id: 'next', type: 'Flow', label: 'Next' },
      { id: 'objectOut', type: 'Data', label: 'Object Out' },
    ],
    schemaConnections: [
      {
        schemaKey: 'NextNode',
        outputPinId: 'next',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'TransformNode',
        outputPinId: 'objectOut',
        outputPinType: 'Data',
        nodeSelector: 'DevNode',
        multiple: false,
      },
    ],
    fields: [
      {
        id: 'Offset',
        type: FIELD_TYPES.OBJECT,
        label: 'Offset',
        options: {
          Label: 'Offset',
          Fields: [
            {
              id: 'X',
              type: FIELD_TYPES.OBJECT,
              label: 'X',
              options: {
                Label: 'X',
                Fields: [
                  { id: 'Value', type: FIELD_TYPES.INT, label: 'Value', options: { Label: 'Value', Default: 0 } },
                  {
                    id: 'Relative',
                    type: FIELD_TYPES.CHECKBOX,
                    label: 'Relative',
                    options: { Label: 'Relative', Default: false },
                  },
                ],
              },
            },
            {
              id: 'Y',
              type: FIELD_TYPES.OBJECT,
              label: 'Y',
              options: {
                Label: 'Y',
                Fields: [
                  { id: 'Value', type: FIELD_TYPES.INT, label: 'Value', options: { Label: 'Value', Default: 0 } },
                  {
                    id: 'Relative',
                    type: FIELD_TYPES.CHECKBOX,
                    label: 'Relative',
                    options: { Label: 'Relative', Default: false },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  }),
  createTemplate({
    templateId: 'all-fields',
    label: 'All Fields Node',
    category: 'Coverage',
    defaultTypeName: 'AllFields',
    inputPins: [
      { id: 'entry', type: 'Flow', label: 'Entry' },
      { id: 'context', type: 'Data', label: 'Context' },
      { id: 'metrics', type: 'Number', label: 'Metrics' },
    ],
    outputPins: [
      { id: 'primary', type: 'Flow', label: 'Primary' },
      { id: 'secondary', type: 'Flow', label: 'Secondary' },
      { id: 'data', type: 'Data', label: 'Data' },
      { id: 'alerts', type: 'Flow', label: 'Alerts', multiple: true },
    ],
    schemaConnections: [
      {
        schemaKey: 'PrimaryNode',
        outputPinId: 'primary',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'SecondaryNode',
        outputPinId: 'secondary',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'DataNode',
        outputPinId: 'data',
        outputPinType: 'Data',
        nodeSelector: 'DevNode',
        multiple: false,
      },
      {
        schemaKey: 'AlertNodes',
        outputPinId: 'alerts',
        outputPinType: 'Flow',
        nodeSelector: 'DevNode',
        multiple: true,
      },
    ],
    fields: [
      {
        id: 'SmallString',
        type: FIELD_TYPES.SMALL_STRING,
        label: 'SmallString',
        options: { Label: 'SmallString', Default: 'Example' },
      },
      {
        id: 'String',
        type: FIELD_TYPES.STRING,
        label: 'String',
        options: { Label: 'String', Default: 'Multiline text', Height: 72 },
      },
      {
        id: 'Float',
        type: FIELD_TYPES.FLOAT,
        label: 'Float',
        options: { Label: 'Float', Default: 1.5 },
      },
      {
        id: 'Int',
        type: FIELD_TYPES.INT,
        label: 'Int',
        options: { Label: 'Int', Default: 3 },
      },
      {
        id: 'Integer',
        type: FIELD_TYPES.INTEGER,
        label: 'Integer',
        options: { Label: 'Integer', Default: 64 },
      },
      {
        id: 'IntSlider',
        type: FIELD_TYPES.INT_SLIDER,
        label: 'IntSlider',
        options: { Label: 'IntSlider', Default: 35, Min: 0, Max: 100, TickFrequency: 5 },
      },
      {
        id: 'Checkbox',
        type: FIELD_TYPES.CHECKBOX,
        label: 'Checkbox',
        options: { Label: 'Checkbox', Default: true },
      },
      {
        id: 'Bool',
        type: FIELD_TYPES.BOOL,
        label: 'Bool',
        options: { Label: 'Bool', DefaultValue: false },
      },
      {
        id: 'Enum',
        type: FIELD_TYPES.ENUM,
        label: 'Enum',
        options: { Label: 'Enum', Values: ['Low', 'Medium', 'High'], Default: 'Medium' },
      },
      {
        id: 'FilePath',
        type: FIELD_TYPES.FILE_PATH,
        label: 'FilePath',
        options: { Label: 'FilePath', Default: 'data/sample.json' },
      },
      {
        id: 'List',
        type: FIELD_TYPES.LIST,
        label: 'List',
        options: { Label: 'List', ArrayElementType: FIELD_TYPES.STRING },
      },
      {
        id: 'Object',
        type: FIELD_TYPES.OBJECT,
        label: 'Object',
        options: {
          Label: 'Object',
          Fields: [
            { id: 'Min', type: FIELD_TYPES.FLOAT, label: 'Min', options: { Label: 'Min', Default: 0 } },
            { id: 'Max', type: FIELD_TYPES.FLOAT, label: 'Max', options: { Label: 'Max', Default: 1 } },
          ],
        },
      },
    ],
  }),
];

export const SAMPLE_TEMPLATE_BY_ID = new Map(
  SAMPLE_NODE_TEMPLATES.map((template) => [template.templateId, template])
);

export function getTemplateById(templateId) {
  return SAMPLE_TEMPLATE_BY_ID.get(templateId);
}

export function getDefaultTemplate() {
  return SAMPLE_NODE_TEMPLATES[0];
}

export function findTemplateByTypeName(typeName) {
  if (typeof typeName !== 'string' || !typeName.trim()) {
    return undefined;
  }

  const normalized = typeName.trim().toLowerCase();
  return SAMPLE_NODE_TEMPLATES.find(
    (template) =>
      template.defaultTypeName.toLowerCase() === normalized ||
      template.label.toLowerCase() === normalized ||
      template.templateId.toLowerCase() === normalized
  );
}
