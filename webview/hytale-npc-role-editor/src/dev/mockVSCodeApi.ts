import type { NpcRoleEditorExtensionToWebviewMessage } from "@shared/npc-role-editor/messageTypes";
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
  "--vscode-font-family": "system-ui, sans-serif",
};

type DevBootstrapResponse = {
  descriptors: unknown;
  descriptorPath: string;
  descriptorSource: "default-data";
  documentPath: string;
  text: string;
  version: number;
  error?: string;
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

  private send(message: NpcRoleEditorExtensionToWebviewMessage) {
    window.dispatchEvent(
      new MessageEvent<NpcRoleEditorExtensionToWebviewMessage>("message", {
        data: message,
      }),
    );
  }

  private async sendBootstrap() {
    const response = await fetch("/__npc-role-editor/dev-bootstrap");
    const payload = (await response.json()) as DevBootstrapResponse;

    if (payload.error) {
      this.send({
        type: "error",
        message: payload.error,
      });
      return;
    }

    this.send({
      type: "bootstrap",
      descriptors: payload.descriptors as never,
      descriptorPath: payload.descriptorPath,
      descriptorSource: payload.descriptorSource,
    });
    this.send({
      type: "update",
      documentPath: payload.documentPath,
      text: payload.text,
      version: payload.version,
    });
  }

  async postMessage(message: { type: "ready" } | { type: "openRawJson" }) {
    switch (message.type) {
      case "ready":
        await this.sendBootstrap();
        return;
      case "openRawJson":
        return;
      default:
        return;
    }
  }
}
