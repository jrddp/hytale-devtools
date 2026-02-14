<script>
  import { getFieldLabel } from '../node-editor/fieldValueUtils.js';

  export let field;

  $: label = getFieldLabel(field);
</script>

<div class="flex flex-col gap-1.5 rounded-md border border-dashed border-vsc-editor-widget-border p-2">
  <div class="text-xs font-bold uppercase text-vsc-muted">{label}</div>
  <div class="flex flex-col gap-1.5">
    <slot />
  </div>
</div>
