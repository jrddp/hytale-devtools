<script lang="ts">
  let {
    title,
    html,
    class: className = "",
  }: {
    title: string;
    html: string;
    class?: string;
  } = $props();
</script>

<div
  class={`pointer-events-auto rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg px-3 py-2.5 text-vsc-editor-fg shadow-2xl ${className}`.trim()}
>
  <div class="text-[0.65rem] font-semibold uppercase tracking-widest text-vsc-muted">
    {title}
  </div>
  <div class="description-markdown mt-1.5 text-xs leading-4 text-vsc-input-fg">
    {@html html}
  </div>
</div>

<style>
  .description-markdown :global(p + p) {
    margin-top: 0.5rem;
  }

  .description-markdown :global(ul) {
    margin-top: 0.375rem;
    list-style-type: disc;
    padding-left: 1rem;
  }

  .description-markdown :global(ol) {
    margin-top: 0.375rem;
    list-style-type: decimal;
    padding-left: 1rem;
  }

  .description-markdown :global(li + li) {
    margin-top: 0.125rem;
  }

  .description-markdown :global(code) {
    border: 1px solid var(--vscode-input-border);
    border-radius: 0.25rem;
    background: var(--vscode-input-background);
    padding: 0 0.25rem;
    font-size: 0.7rem;
  }

  .description-markdown :global(a) {
    color: var(--vscode-textLink-foreground);
    text-decoration: underline;
    text-decoration-thickness: from-font;
  }

  .description-markdown :global(a:hover) {
    color: var(--vscode-textLink-activeForeground);
  }
</style>
