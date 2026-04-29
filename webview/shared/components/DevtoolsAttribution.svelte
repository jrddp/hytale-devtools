<script lang="ts">
  let {
    align = "left",
    class: className = "",
  }: {
    align?: "left" | "right";
    class?: string;
  } = $props();

  const feedbackUrl = "https://github.com/jrddp/hytale-devtools/issues/new";
</script>

<div
  class={`text-[11px] leading-4 text-vsc-muted ${align === "right" ? "text-right" : "text-left"} ${className}`}
>
  <div>Hytale Devtools by Kokeria</div>
  <a
    class="underline underline-offset-2 hover:text-vsc-editor-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vsc-focus"
    style="text-decoration-line: underline;"
    href={feedbackUrl}
    target="_blank"
    rel="noreferrer"
  >
    Submit feedback
  </a>
</div>
