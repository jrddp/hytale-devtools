export type ComputeAutocompleteOptionKind = "parameter" | "function" | "constant";

export type ComputeAutocompleteOption = {
  label: string;
  insertText: string;
  kind: ComputeAutocompleteOptionKind;
  detail: string;
  description?: string;
};

export type ComputeAutocompleteSatisfiedResult = {
  cursorPos: number;
};

const IDENTIFIER_AT_END_PATTERN = /([a-zA-Z_][a-zA-Z0-9_]*)$/;
const IDENTIFIER_PATTERN = /([a-zA-Z_][a-zA-Z0-9_]*)$/;
const IDENTIFIER_CHAR_PATTERN = /[a-zA-Z0-9_]/;

export type ComputeAutocompleteContext = {
  query: string;
  activeFunctionName?: string;
  shouldShow: boolean;
};

export function extractComputeAutocompleteQuery(value: string, cursorPos: number): string {
  const beforeCursor = value.slice(0, cursorPos);
  const match = beforeCursor.match(IDENTIFIER_AT_END_PATTERN);
  return match?.[1] ?? "";
}

export function getComputeAutocompleteContext(
  value: string,
  cursorPos: number,
  functionNames: string[],
): ComputeAutocompleteContext {
  const query = extractComputeAutocompleteQuery(value, cursorPos);
  if (query.length > 0) {
    return {
      query,
      shouldShow: true,
    };
  }

  const activeFunctionName =
    findOpenFunctionContext(value, cursorPos, functionNames) ??
    findFunctionNameEndingAtCursor(value, cursorPos, functionNames);
  if (activeFunctionName) {
    return {
      query: activeFunctionName,
      activeFunctionName,
      shouldShow: true,
    };
  }

  return {
    query: "",
    shouldShow: false,
  };
}

export function filterComputeAutocompleteOptions(
  options: ComputeAutocompleteOption[],
  query: string,
  activeFunctionName?: string,
): ComputeAutocompleteOption[] {
  if (activeFunctionName) {
    const normalizedFunctionName = activeFunctionName.toLowerCase();
    return options.filter(
      option =>
        option.kind === "function" &&
        option.insertText.slice(0, -1).toLowerCase() === normalizedFunctionName,
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter(option => option.label.toLowerCase().includes(normalizedQuery));
}

export function applyComputeAutocompleteOption(
  value: string,
  cursorPos: number,
  option: Pick<ComputeAutocompleteOption, "insertText">,
): { value: string; cursorPos: number } {
  const beforeCursor = value.slice(0, cursorPos);
  const afterCursor = value.slice(cursorPos);
  const match = beforeCursor.match(IDENTIFIER_AT_END_PATTERN);
  const prefix = match
    ? beforeCursor.slice(0, beforeCursor.length - match[1].length)
    : beforeCursor;
  const nextValue = `${prefix}${option.insertText}${afterCursor}`;
  return {
    value: nextValue,
    cursorPos: prefix.length + option.insertText.length,
  };
}

export function resolveSatisfiedComputeAutocomplete(
  value: string,
  cursorPos: number,
  option: Pick<ComputeAutocompleteOption, "kind" | "insertText">,
  functionNames: string[],
): ComputeAutocompleteSatisfiedResult | null {
  if (option.kind === "function") {
    const functionName = option.insertText.endsWith("(")
      ? option.insertText.slice(0, -1)
      : option.insertText;
    const functionSpan = findFunctionSpanAtCursor(value, cursorPos, functionNames);
    if (!functionSpan || functionSpan.name !== functionName) {
      return null;
    }

    return {
      cursorPos:
        functionSpan.closeParenIndex !== undefined
          ? functionSpan.closeParenIndex + 1
          : Math.max(cursorPos, functionSpan.openParenIndex + 1),
    };
  }

  const identifierSpan = getIdentifierSpanAtCursor(value, cursorPos);
  if (!identifierSpan || identifierSpan.text !== option.insertText) {
    return null;
  }

  return {
    cursorPos: identifierSpan.end,
  };
}

function findOpenFunctionContext(
  value: string,
  cursorPos: number,
  functionNames: string[],
): string | undefined {
  return findFunctionSpanAtCursor(value, cursorPos, functionNames)?.name;
}

function findFunctionNameEndingAtCursor(
  value: string,
  cursorPos: number,
  functionNames: string[],
): string | undefined {
  if (cursorPos <= 0 || value[cursorPos - 1] !== ")") {
    return undefined;
  }

  const knownFunctions = new Set(functionNames);
  let depth = 0;

  for (let index = cursorPos - 1; index >= 0; index -= 1) {
    const currentChar = value[index];

    if (currentChar === ")") {
      depth += 1;
      continue;
    }

    if (currentChar !== "(") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return resolveFunctionNameAtOpenParen(value, index, knownFunctions);
    }
  }

  return undefined;
}

function resolveFunctionNameAtOpenParen(
  value: string,
  openParenIndex: number,
  knownFunctions: Set<string>,
): string | undefined {
  const beforeOpenParen = value.slice(0, openParenIndex);
  const match = beforeOpenParen.match(IDENTIFIER_PATTERN);
  const candidate = match?.[1];
  if (candidate && knownFunctions.has(candidate)) {
    return candidate;
  }

  return undefined;
}

function getIdentifierSpanAtCursor(
  value: string,
  cursorPos: number,
): { start: number; end: number; text: string } | undefined {
  let start = cursorPos;
  let end = cursorPos;

  if (start > 0 && IDENTIFIER_CHAR_PATTERN.test(value[start - 1] ?? "")) {
    start -= 1;
  } else if (!IDENTIFIER_CHAR_PATTERN.test(value[start] ?? "")) {
    return undefined;
  }

  while (start > 0 && IDENTIFIER_CHAR_PATTERN.test(value[start - 1] ?? "")) {
    start -= 1;
  }

  while (end < value.length && IDENTIFIER_CHAR_PATTERN.test(value[end] ?? "")) {
    end += 1;
  }

  return {
    start,
    end,
    text: value.slice(start, end),
  };
}

function findFunctionSpanAtCursor(
  value: string,
  cursorPos: number,
  functionNames: string[],
): { name: string; openParenIndex: number; closeParenIndex?: number } | undefined {
  const knownFunctions = new Set(functionNames);
  const identifierSpan = getIdentifierSpanAtCursor(value, cursorPos);
  if (
    identifierSpan &&
    knownFunctions.has(identifierSpan.text) &&
    value[identifierSpan.end] === "("
  ) {
    return {
      name: identifierSpan.text,
      openParenIndex: identifierSpan.end,
      closeParenIndex: findMatchingCloseParen(value, identifierSpan.end),
    };
  }

  let depth = 0;
  const endsAtClosedCall = cursorPos > 0 && value[cursorPos - 1] === ")";

  for (let index = cursorPos - 1; index >= 0; index -= 1) {
    const currentChar = value[index];

    if (currentChar === ")") {
      depth += 1;
      continue;
    }

    if (currentChar !== "(") {
      continue;
    }

    if (depth > 0) {
      depth -= 1;
      if (depth === 0 && endsAtClosedCall) {
        return resolveFunctionSpanAtOpenParen(value, index, knownFunctions);
      }
      continue;
    }

    return resolveFunctionSpanAtOpenParen(value, index, knownFunctions);
  }

  return undefined;
}

function resolveFunctionSpanAtOpenParen(
  value: string,
  openParenIndex: number,
  knownFunctions: Set<string>,
): { name: string; openParenIndex: number; closeParenIndex?: number } | undefined {
  const name = resolveFunctionNameAtOpenParen(value, openParenIndex, knownFunctions);
  if (!name) {
    return undefined;
  }

  return {
    name,
    openParenIndex,
    closeParenIndex: findMatchingCloseParen(value, openParenIndex),
  };
}

function findMatchingCloseParen(value: string, openParenIndex: number): number | undefined {
  let depth = 0;

  for (let index = openParenIndex; index < value.length; index += 1) {
    const currentChar = value[index];
    if (currentChar === "(") {
      depth += 1;
      continue;
    }

    if (currentChar !== ")") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return index;
    }
  }

  return undefined;
}
