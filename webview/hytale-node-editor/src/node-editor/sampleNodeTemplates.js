import { FIELD_TYPES } from './types.js';
import { buildFieldValueMap } from './fieldValueUtils.js';

function createTemplate(definition) {
  return {
    ...definition,
    buildInitialValues: () => buildFieldValueMap(definition.fields),
  };
}

export const SAMPLE_NODE_TEMPLATES = [
  createTemplate({
    templateId: 'simple',
    label: 'Simple Node',
    subtitle: 'Basic custom node',
    category: 'Basics',
    defaultTypeName: 'Simple',
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
    subtitle: 'Headline + body',
    category: 'Basics',
    defaultTypeName: 'Text',
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
    subtitle: 'Int + Integer + Float',
    category: 'Controls',
    defaultTypeName: 'Number',
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
    subtitle: 'IntSlider field',
    category: 'Controls',
    defaultTypeName: 'Slider',
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
    subtitle: 'Checkbox + Bool + Enum',
    category: 'Controls',
    defaultTypeName: 'Toggle',
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
    subtitle: 'FilePath + List',
    category: 'Data',
    defaultTypeName: 'Asset',
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
    subtitle: 'Nested Object fields',
    category: 'Data',
    defaultTypeName: 'ObjectNode',
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
    subtitle: 'Coverage for all supported field types',
    category: 'Coverage',
    defaultTypeName: 'AllFields',
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
