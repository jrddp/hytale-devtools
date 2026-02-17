export const FIELD_TYPES = {
  SMALL_STRING: 'SmallString',
  STRING: 'String',
  FLOAT: 'Float',
  INT: 'Int',
  INTEGER: 'Integer',
  INT_SLIDER: 'IntSlider',
  CHECKBOX: 'Checkbox',
  BOOL: 'Bool',
  ENUM: 'Enum',
  FILE_PATH: 'FilePath',
  LIST: 'List',
  OBJECT: 'Object',
};

export const FIELD_TYPE_VALUES = Object.values(FIELD_TYPES);

export const CUSTOM_NODE_TYPE = 'customMetadata';
export const GROUP_NODE_TYPE = 'groupMetadata';
export const COMMENT_NODE_TYPE = 'commentMetadata';
export const GENERIC_ADD_CATEGORY = 'Generic';
export const GENERIC_ACTION_CREATE_GROUP = 'create-group';
export const GENERIC_ACTION_CREATE_COMMENT = 'create-comment';
export const GROUP_MUTATION_EVENT = 'hytale-node-editor-group-mutation';
export const COMMENT_MUTATION_EVENT = 'hytale-node-editor-comment-mutation';
export const PAYLOAD_TEMPLATE_ID_KEY = '$TemplateId';
export const PAYLOAD_EDITOR_FIELDS_KEY = '$EditorFields';
