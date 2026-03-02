import { MockVSCodeApi } from "src/node-editor/dev/mockVSCodeApi";
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const vscode = globalThis.acquireVsCodeApi
  ? globalThis.acquireVsCodeApi()
  : new MockVSCodeApi();

const app = mount(App, {
  target: document.getElementById("app"),
  props: {
    vscode,
  },
});

export default app;
