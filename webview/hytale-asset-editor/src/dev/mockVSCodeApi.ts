import type {
  AssetEditorExtensionToWebviewMessage,
  AssetEditorWebviewToExtensionMessage,
} from "@shared/asset-editor/messageTypes";
import type { IndexReference } from "@shared/indexTypes";
import type { VSCodeApi } from "src/common";

const mockedThemeVars: Record<string, string> = {
  "--vscode-editor-background": "#ffffff",
  "--vscode-editor-foreground": "#1f2328",
  "--vscode-sideBar-background": "#f6f8fa",
  "--vscode-panel-border": "#d0d7de",
  "--vscode-editorWidget-background": "#ffffff",
  "--vscode-editorWidget-border": "#d0d7de",
  "--vscode-button-secondaryBackground": "#eaeef2",
  "--vscode-button-secondaryForeground": "#1f2328",
  "--vscode-button-secondaryHoverBackground": "#dde3ea",
  "--vscode-badge-background": "#dbeafe",
  "--vscode-badge-foreground": "#1d4ed8",
  "--vscode-descriptionForeground": "#57606a",
  "--vscode-input-background": "#ffffff",
  "--vscode-input-foreground": "#1f2328",
  "--vscode-input-border": "#d0d7de",
  "--vscode-focusBorder": "#0969da",
  "--vscode-list-hoverBackground": "#eef2f6",
  "--vscode-list-activeSelectionBackground": "#dbeafe",
  "--vscode-list-activeSelectionForeground": "#1d4ed8",
  "--vscode-errorForeground": "#cf222e",
  "--vscode-editorHoverWidget-background": "#ffffff",
  "--vscode-editorHoverWidget-foreground": "#1f2328",
  "--vscode-editorHoverWidget-border": "#d0d7de",
  "--vscode-inputValidation-errorBackground": "rgba(207, 34, 46, 0.12)",
  "--vscode-font-family": "system-ui, sans-serif",
};

type DevBootstrapResponse = {
  assetDefinition: unknown;
  assetsByRef: Map<string, unknown>;
  documentPath: string;
  text: string;
  version: number;
};

export class MockVSCodeApi implements VSCodeApi {
  isDevEnv = true;
  private state?: Record<string, unknown>;

  constructor() {
    Object.entries(mockedThemeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }

  getState() {
    return this.state;
  }

  setState(state: Record<string, unknown>) {
    this.state = state;
    return state;
  }

  private send(message: AssetEditorExtensionToWebviewMessage) {
    window.dispatchEvent(
      new MessageEvent<AssetEditorExtensionToWebviewMessage>("message", {
        data: message,
      }),
    );
  }

  private async sendBootstrap() {
    const response = await fetch("/__asset-editor/dev-bootstrap");
    const payload = (await response.json()) as DevBootstrapResponse & { error?: string };

    if (payload.error) {
      this.send({
        type: "error",
        message: payload.error,
      });
      return;
    }

    this.send({
      type: "bootstrap",
      assetDefinition: payload.assetDefinition as never,
      assetsByRef: payload.assetsByRef as never,
      parent: { status: "none" },
    });
    this.send({
      type: "update",
      documentPath: payload.documentPath,
      text: payload.text,
      version: payload.version,
    });
  }

  private async sendResolvedRef($ref: string) {
    const response = await fetch(`/__asset-editor/resolve-ref?ref=${encodeURIComponent($ref)}`);
    const payload = (await response.json()) as {
      $ref: string;
      field: unknown;
      error?: string;
    };

    if (payload.error) {
      this.send({
        type: "error",
        message: payload.error,
      });
      return;
    }
  }

  private async sendAutocompleteValues(symbolLookup: IndexReference, fieldId: string) {
    const response = await fetch("/__asset-editor/autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbolLookup,
        fieldId,
      }),
    });
    const payload = (await response.json()) as {
      fieldId: string;
      values: string[];
      error?: string;
    };

    if (payload.error) {
      this.send({
        type: "error",
        message: payload.error,
      });
      return;
    }

    this.send({
      type: "autocompletionValues",
      fieldId: payload.fieldId,
      values: payload.values,
    });
  }

  async postMessage(message: AssetEditorWebviewToExtensionMessage) {
    switch (message.type) {
      case "ready":
        await this.sendBootstrap();
        return;
      case "autocompleteRequest":
        await this.sendAutocompleteValues(message.symbolLookup, message.fieldId);
        return;
      case "resolveParent":
        this.send({
          type: "parentUpdate",
          parent: {
            status: "missing",
            parentName: message.parentName,
          },
        });
        return;
      case "apply":
      case "openRawJson":
        return;
      default:
        return;
    }
  }
}
