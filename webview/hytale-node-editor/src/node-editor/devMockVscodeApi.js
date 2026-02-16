import { SAMPLE_NODE_TEMPLATES } from "./sampleNodeTemplates.js";
import { PAYLOAD_EDITOR_FIELDS_KEY, PAYLOAD_TEMPLATE_ID_KEY } from "./types.js";

const DEV_STORAGE_KEY = "hytale-node-editor.dev.document";
const DEFAULT_NODE_A_ID = "Node-11111111-1111-1111-1111-111111111111";
const DEFAULT_NODE_B_ID = "Node-22222222-2222-2222-2222-222222222222";

function getTemplate(templateId, fallbackIndex) {
  return (
    SAMPLE_NODE_TEMPLATES.find((template) => template.templateId === templateId) ??
    SAMPLE_NODE_TEMPLATES[fallbackIndex]
  );
}

function buildNodePayload(nodeId, template, comment) {
  return {
    $NodeId: nodeId,
    Type: template.defaultTypeName,
    [PAYLOAD_TEMPLATE_ID_KEY]: template.templateId,
    [PAYLOAD_EDITOR_FIELDS_KEY]: template.buildInitialValues(),
    ...(typeof comment === "string" && comment.trim() ? { $Comment: comment.trim() } : {}),
  };
}

function buildDefaultDocumentObject() {
  const allFieldsTemplate = getTemplate("all-fields", 0);
  const toggleTemplate = getTemplate("toggles", 1);
  const allFieldsPayload = buildNodePayload(
    DEFAULT_NODE_A_ID,
    allFieldsTemplate,
    "Use this node to preview most field styles."
  );
  const togglePayload = buildNodePayload(
    DEFAULT_NODE_B_ID,
    toggleTemplate,
    "Use Enter/Tab to test field navigation."
  );

  // In dev mode, edges are derived from runtime schema keys rather than $Links metadata.
  allFieldsPayload.PrimaryNode = {
    $NodeId: DEFAULT_NODE_B_ID,
  };

  return {
    $NodeEditorMetadata: {
      $WorkspaceID: "dev-mock-workspace",
      $Nodes: {
        [DEFAULT_NODE_A_ID]: {
          $Position: { $x: -150, $y: 60 },
          $Title: "All Fields Preview",
        },
        [DEFAULT_NODE_B_ID]: {
          $Position: { $x: 260, $y: 120 },
          $Title: "Enum + Toggle Preview",
        },
      },
      $FloatingNodes: [
        allFieldsPayload,
        togglePayload,
      ],
      $Links: {
        [`${DEFAULT_NODE_A_ID}--${DEFAULT_NODE_B_ID}`]: {
          $SourceNodeId: DEFAULT_NODE_A_ID,
          $TargetNodeId: DEFAULT_NODE_B_ID,
        },
      },
      $Groups: [],
      $Comments: [],
    },
  };
}

const DEFAULT_DEV_DOCUMENT_TEXT = JSON.stringify(buildDefaultDocumentObject(), null, 2);

function readStoredDocumentText() {
  try {
    const raw = window.localStorage.getItem(DEV_STORAGE_KEY);
    return typeof raw === "string" && raw.trim() ? raw : DEFAULT_DEV_DOCUMENT_TEXT;
  } catch {
    return DEFAULT_DEV_DOCUMENT_TEXT;
  }
}

function writeStoredDocumentText(text) {
  try {
    window.localStorage.setItem(DEV_STORAGE_KEY, text);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function dispatchWebviewMessage(payload) {
  window.dispatchEvent(new MessageEvent("message", { data: payload }));
}

function applyMockThemeTokens() {
  const root = document.documentElement;
  const themeTokens = {
    "--vscode-font-family": "-apple-system, BlinkMacSystemFont, sans-serif",
    "--vscode-font-size": "13px",
    "--vscode-font-weight": "normal",
    "--vscode-editor-background": "#ffffff",
    "--vscode-editor-foreground": "#313131",
    "--vscode-foreground": "#313131",
    "--vscode-editorWidget-background": "#f4f4f4",
    "--vscode-editorWidget-border": "#adadad",
    "--vscode-input-background": "#eaeaea",
    "--vscode-input-foreground": "#313131",
    "--vscode-input-border": "#adadad",
    "--vscode-descriptionForeground": "#717171",
    "--vscode-focusBorder": "#e1239a",
    "--vscode-list-hoverBackground": "#ffffff",
    "--vscode-list-activeSelectionBackground": "rgba(225, 35, 154, 0.33)",
    "--vscode-list-activeSelectionForeground": "#313131",
    "--vscode-button-secondaryBackground": "#ffffff",
    "--vscode-button-secondaryForeground": "#313131",
    "--vscode-button-secondaryHoverBackground": "#ffffff",
    "--vscode-button-border": "#00000000",
    "--vscode-errorForeground": "#a1260d",
  };

  for (const [token, value] of Object.entries(themeTokens)) {
    root.style.setProperty(token, value);
  }
}

export function createMockVscodeApi() {
  applyMockThemeTokens();

  let documentText = readStoredDocumentText();
  let documentVersion = 1;
  let stateValue = {};

  return {
    postMessage(message) {
      if (!message || typeof message.type !== "string") {
        return;
      }

      if (message.type === "ready") {
        dispatchWebviewMessage({
          type: "update",
          text: documentText,
          version: documentVersion,
          documentPath: "/mock/Server/HytaleGenerator/Biomes/Dev.json",
        });
        return;
      }

      if (message.type === "apply" && typeof message.text === "string") {
        documentText = message.text;
        documentVersion += 1;
        writeStoredDocumentText(documentText);
        return;
      }
    },
    getState() {
      return stateValue;
    },
    setState(nextState) {
      stateValue = nextState ?? {};
      return stateValue;
    },
  };
}
