<script lang="ts">
  import type {
    AssetEditorExtensionToWebviewMessage,
  } from "@shared/asset-editor/messageTypes";
  import type { AssetDefinition, Field } from "@shared/fieldTypes";
  import { onMount } from "svelte";
  import type { VSCodeApi } from "src/common";
  import { workspace } from "src/workspace.svelte";
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

<main class="flex h-screen min-h-0 flex-col bg-vsc-bg text-sm text-vsc-editor-fg">
  <header class="border-b border-vsc-border bg-vsc-panel px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="truncate text-base font-semibold">
          {assetDefinition?.title ?? "Asset Editor"}
        </div>
        <div class="mt-1 truncate text-xs opacity-70">{documentPath || "Waiting for document..."}</div>
        <div class="mt-1 text-xs opacity-60">Version {version} · {documentText.length} chars</div>
      </div>

      <button
        type="button"
        class="rounded-md border border-vsc-border bg-vsc-button-bg px-3 py-1.5 text-xs font-medium text-vsc-button-fg hover:bg-vsc-button-hover"
        onclick={() => vscode.postMessage({ type: "openRawJson" })}
      >
        Open JSON
      </button>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-auto p-4">
    {#if extensionError}
      <div class="rounded-md border border-vsc-border bg-red-500/10 px-3 py-2 text-vsc-error">
        {extensionError}
      </div>
    {:else if !assetDefinition}
      <div class="rounded-md border border-vsc-border bg-vsc-panel px-3 py-2 opacity-70">
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
