<script lang="ts">
  import type { AssetEditorExtensionToWebviewMessage } from "@shared/asset-editor/messageTypes";
  import type { AssetDefinition, Field } from "@shared/fieldTypes";
  import type { VSCodeApi } from "src/common";
  import { workspace } from "src/workspace.svelte";
  import { onMount } from "svelte";
  import FieldRenderer from "./components/FieldRenderer.svelte";
  import ObjectField from "./components/fields/ObjectField.svelte";
  import VariantField from "./components/fields/VariantField.svelte";

  const { vscode }: { vscode: VSCodeApi } = $props();

  let assetDefinition = $state<AssetDefinition | null>(null);
  let documentPath = $state("");
  let documentText = $state("");
  let version = $state(0);
  let extensionError = $state("");

  $effect(() => {
    workspace.vscode = vscode;
  });

  function handleMessage(event: MessageEvent<AssetEditorExtensionToWebviewMessage>) {
    const message = event.data;
    console.log("message received", message);

    switch (message.type) {
      case "bootstrap":
        assetDefinition = message.assetDefinition;
        workspace.resetResolvedRefs();
        extensionError = "";
        return;
      case "update":
        documentPath = message.documentPath;
        documentText = message.text;
        version = message.version;
        return;
      case "resolvedRef":
        workspace.pendingRefs.delete(message.$ref);
        workspace.resolvedRefsByRef.set(message.$ref, message.field);
        return;
      case "error":
        extensionError = message.message;
        return;
      default:
        return;
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<main class="flex flex-col h-screen min-h-0 text-sm bg-vsc-bg text-vsc-editor-fg">
  <header
    class="flex items-start justify-between gap-3 px-4 py-3 border-b border-vsc-border bg-vsc-panel"
  >
    <div class="min-w-0">
      <div class="space-x-1">
        <span class="text-lg font-semibold truncate"
          >{documentPath.split("/").pop().split(".")[0]}</span
        >
        <span class="text-xs italic font-normal text-vsc-muted"
          >{assetDefinition?.title ?? "Asset Editor"}</span
        >
      </div>
      <div class="mt-1 text-xs truncate text-vsc-muted">
        {documentPath.substring(documentPath.indexOf(assetDefinition?.path ?? "")) ||
          "Waiting for document..."}
      </div>
    </div>

    <button
      type="button"
      class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
      onclick={() => vscode.postMessage({ type: "openRawJson" })}
    >
      Open JSON
    </button>
  </header>

  <div class="flex-1 min-h-0 p-4 overflow-auto">
    {#if extensionError}
      <div class="px-3 py-2 border rounded-md border-vsc-border bg-red-500/10 text-vsc-error">
        {extensionError}
      </div>
    {:else if !assetDefinition}
      <div class="px-3 py-2 border rounded-md border-vsc-border bg-vsc-panel opacity-70">
        Loading asset definition...
      </div>
    {:else}
      {#snippet renderField(field: Field)}
        <FieldRenderer {field} />
      {/snippet}

      {#if assetDefinition.rootField.type === "object"}
        <ObjectField field={assetDefinition.rootField} {renderField} root />
      {:else}
        <VariantField field={assetDefinition.rootField} {renderField} root />
      {/if}
    {/if}
  </div>
</main>
