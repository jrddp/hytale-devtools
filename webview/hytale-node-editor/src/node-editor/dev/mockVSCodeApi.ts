import { createEmptyNodeEditorClipboardSelection } from "@shared/node-editor/clipboardTypes";
import { parseAssetDocumentToGraphDocument } from "@shared/node-editor/graphDocument";
import {
  type ExtensionToWebviewMessage,
  type WebviewToExtensionMessage,
} from "@shared/node-editor/messageTypes";
import { type AssetDocumentShape } from "@shared/node-editor/assetTypes";
import { type NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { type VSCodeApi } from "src/common";
import { mockedThemeVars } from "src/node-editor/dev/mockVSCodeTheme";
import basicBiomeAsset from "./Basic.json";
import mockedWorkspaceContext from "./mockedWorkspaceContext.json";

export class MockVSCodeApi implements VSCodeApi {
  constructor() {
    Object.entries(mockedThemeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }

  private sendMockedVSCodeMessage(message: ExtensionToWebviewMessage) {
    window.dispatchEvent(new MessageEvent<ExtensionToWebviewMessage>("message", { data: message }));
  }

  postMessage(message: WebviewToExtensionMessage) {
    switch (message.type) {
      case "ready":
        const workspaceContext = mockedWorkspaceContext as unknown as NodeEditorWorkspaceContext;
        const graphDocument = parseAssetDocumentToGraphDocument(
          basicBiomeAsset as AssetDocumentShape,
          workspaceContext,
        );
        this.sendMockedVSCodeMessage({
          type: "bootstrap",
          workspaceContext,
          controlScheme: "trackpad",
          platform: "mac",
          clipboard: createEmptyNodeEditorClipboardSelection(),
          isDevelopment: true,
        });
        this.sendMockedVSCodeMessage({
          type: "update",
          graphDocument,
          version: 1,
          documentPath: "test",
        });
        break;
    }
  }
}
