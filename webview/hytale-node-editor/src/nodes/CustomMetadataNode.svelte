<script>
  import { Handle, Position, useSvelteFlow } from '@xyflow/svelte';
  import FieldEditor from '../fields/FieldEditor.svelte';
  import {
    getDefaultTemplate,
    getTemplateById,
    findTemplateByTypeName,
  } from '../node-editor/sampleNodeTemplates.js';
  import {
    buildFieldValueMap,
    getFieldLabel,
    isObject,
    normalizeFieldValue,
  } from '../node-editor/fieldValueUtils.js';

  export let id;
  export let data = {};

  const { updateNodeData } = useSvelteFlow();

  $: template =
    getTemplateById(data?.$templateId) ??
    findTemplateByTypeName(data?.Type) ??
    findTemplateByTypeName(data?.label) ??
    getDefaultTemplate();

  $: initialValues = template?.buildInitialValues?.() ?? buildFieldValueMap(template?.fields ?? []);
  $: existingFieldValues = isObject(data?.$fieldValues) ? data.$fieldValues : {};
  $: mergedFieldValues = {
    ...initialValues,
    ...existingFieldValues,
  };
  $: commentInputId = `comment-${sanitizeId(id)}`;

  function updateLabel(nextLabel) {
    updateNodeData(id, {
      label: nextLabel,
      $templateId: template.templateId,
    });
  }

  function updateComment(nextComment) {
    const normalizedComment = typeof nextComment === 'string' ? nextComment : '';
    updateNodeData(id, {
      $comment: normalizedComment,
      $templateId: template.templateId,
    });
  }

  function updateField(field, nextValue) {
    const currentValues = isObject(data?.$fieldValues) ? data.$fieldValues : {};
    const normalizedValue = normalizeFieldValue(field, nextValue);

    updateNodeData(id, {
      $templateId: template.templateId,
      $fieldValues: {
        ...currentValues,
        [field.id]: normalizedValue,
      },
    });
  }

  function readFieldValue(field) {
    return normalizeFieldValue(field, mergedFieldValues[field.id]);
  }

  function sanitizeId(candidate) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      return "node";
    }
    return candidate.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
</script>

<div class="min-w-72 max-w-80 rounded-lg border border-vsc-editor-widget-border bg-vsc-editor-widget-bg p-2.5 text-vsc-editor-fg shadow-lg">
  <Handle type="target" position={Position.Left} />

  <div class="mb-2 flex flex-col gap-1">
    <input
      class="nodrag w-full rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs font-bold text-vsc-input-fg"
      type="text"
      value={typeof data?.label === 'string' ? data.label : template.label}
      oninput={(event) => updateLabel(event.currentTarget.value)}
    />

    {#if template?.subtitle}
      <div class="text-xs text-vsc-muted">{template.subtitle}</div>
    {/if}
  </div>

  <div class="flex flex-col gap-2">
    {#each template.fields as field}
      <FieldEditor
        {field}
        value={readFieldValue(field)}
        on:change={(event) => updateField(field, event.detail.value)}
      />
    {/each}

    <div class="flex flex-col gap-1">
      <label class="text-xs text-vsc-muted" for={commentInputId}>
        Comment
      </label>
      <textarea
        id={commentInputId}
        class="nodrag min-h-10 w-full resize-y rounded-md border border-vsc-input-border bg-vsc-input-bg px-2 py-1.5 text-xs text-vsc-input-fg"
        rows="2"
        value={typeof data?.$comment === 'string' ? data.$comment : ''}
        oninput={(event) => updateComment(event.currentTarget.value)}
      ></textarea>
    </div>
  </div>

  <Handle type="source" position={Position.Right} />
</div>
