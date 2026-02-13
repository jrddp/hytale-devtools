<script>
  import { onMount } from "svelte";
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import Flow from "./Flow.svelte";

  export let vscode;

  let editorText = "";
  let syncedText = "";
  let sourceVersion = -1;
  let status = "booting webview...";
  let extensionError = "";

  function handleMessage(event) {
    const message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "update") {
      editorText = typeof message.text === "string" ? message.text : "";
      syncedText = editorText;
      sourceVersion = typeof message.version === "number" ? message.version : sourceVersion;
      status = "received document update from extension";
      extensionError = "";
      return;
    }

    if (message.type === "error") {
      extensionError =
        typeof message.message === "string" ? message.message : "Unknown editor error.";
      status = "received error from extension";
    }
  }

  function applyChanges() {
    vscode.postMessage({
      type: "apply",
      text: editorText,
      sourceVersion,
    });
    status = "apply message sent";
  }

  function onInput() {
    status = editorText === syncedText ? "synced" : "local edits pending";
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    status = "webview script loaded";
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<main class="flex flex-col h-screen min-h-0 p-3">
  <SvelteFlowProvider>
    <Flow />
  </SvelteFlowProvider>
</main>
