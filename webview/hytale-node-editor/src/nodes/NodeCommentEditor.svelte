<script>
  import { createEventDispatcher, tick } from "svelte";

  export let id = "";
  export let value = "";
  export let isVisible = false;
  export let isEditing = false;

  const dispatch = createEventDispatcher();

  $: commentValue = typeof value === "string" ? value : "";
  $: hasComment = commentValue.trim().length > 0;
  $: isVisible = isEditing || hasComment || forceShow;
  $: renderedValue = isEditing ? draft : commentValue;
  $: if (!isEditing) {
    draft = commentValue;
  }
  $: if (isVisible) {
    void tick().then(resizeTextarea);
  }

  let forceShow = false;
  let draft = "";
  let textareaElement;

  export async function startEditing(selectText = false) {
    forceShow = true;

    if (!isEditing) {
      isEditing = true;
      draft = commentValue;
      await tick();
    }

    textareaElement?.focus();
    resizeTextarea();

    if (selectText) {
      textareaElement?.select();
      return;
    }

    const cursorIndex = draft.length;
    textareaElement?.setSelectionRange(cursorIndex, cursorIndex);
  }

  function commitEditing() {
    if (!isEditing) {
      return;
    }

    dispatch("change", { value: draft });
    isEditing = false;
    forceShow = draft.trim().length > 0;
    void tick().then(clearSelectionVisuals);
  }

  function handleInput(event) {
    if (!isEditing) {
      return;
    }

    draft = event.currentTarget.value;
    resizeTextarea();
  }

  function handleKeydown(event) {
    if (isEditing) {
      if (event.key === "Escape") {
        event.preventDefault();
        commitEditing();
        textareaElement?.blur();
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void startEditing(false);
    }
  }

  function handleBlur() {
    if (!isEditing) {
      return;
    }

    commitEditing();
  }

  function handleFocus() {
    if (isEditing) {
      return;
    }

    textareaElement?.blur();
  }

  function handlePointerdown(originalEvent) {
    if (isEditing) {
      return;
    }

    dispatch("select", { originalEvent });
  }

  function handleClick() {
    if (isEditing) {
      return;
    }

    void startEditing(true);
  }

  function resizeTextarea() {
    if (!textareaElement) {
      return;
    }

    textareaElement.style.height = "auto";
    textareaElement.style.height = `${textareaElement.scrollHeight}px`;
  }

  function clearSelectionVisuals() {
    if (!textareaElement) {
      return;
    }

    try {
      textareaElement.setSelectionRange(0, 0);
    } catch {
      // Ignore selection range failures when element isn't focusable.
    }

    if (typeof window !== "undefined") {
      window.getSelection?.()?.removeAllRanges();
    }
  }
</script>

{#if isVisible}
  <div class="px-1">
    <textarea
      bind:this={textareaElement}
      {id}
      class={`w-full resize-none overflow-hidden p-1 rounded-md text-left text-xs leading-5 text-vsc-input-fg whitespace-pre-wrap wrap-break-word ${
        isEditing
          ? "nodrag border border-vsc-input-border bg-vsc-input-bg"
          : "border border-transparent bg-transparent cursor-grab active:cursor-grabbing select-none outline-none focus:outline-none focus-visible:outline-none focus:border-transparent"
      }`}
      rows="1"
      readonly={!isEditing}
      aria-label="Node comment"
      value={renderedValue}
      onpointerdown={handlePointerdown}
      onclick={handleClick}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={handleFocus}
      onblur={handleBlur}
    ></textarea>
  </div>
{/if}
