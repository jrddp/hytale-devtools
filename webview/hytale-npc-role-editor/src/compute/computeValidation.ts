import { isNpcComputeNonParameterIdentifier } from "./computeAutocomplete";

enum TokenType {
  Number,
  String,
  Boolean,
  Identifier,
  Plus,
  Minus,
  Multiply,
  Divide,
  Remainder,
  Exponent,
  Greater,
  GreaterEqual,
  Less,
  LessEqual,
  Equal,
  NotEqual,
  LogicalAnd,
  LogicalOr,
  LogicalNot,
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseNot,
  OpenParen,
  CloseParen,
  OpenBracket,
  CloseBracket,
  Comma,
  EOF,
}

type Token = {
  type: TokenType;
  value: string | number | boolean;
  start: number;
};

type AstNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "unary"; operand: AstNode }
  | { type: "binary"; left: AstNode; right: AstNode }
  | { type: "call"; args: AstNode[] }
  | { type: "array"; elements: AstNode[] };

export type NpcComputeValidation = {
  valid: boolean;
  errors: string[];
  referencedVariables: string[];
  unresolvedVariables: string[];
};

export function validateNpcComputeExpression(
  expression: string,
  availableParameters: Set<string>,
): NpcComputeValidation {
  const errors: string[] = [];

  try {
    parseExpression(expression);
  } catch (error) {
    errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
  }

  const referencedVariables = extractNpcComputeVariableReferences(expression);
  const unresolvedVariables = referencedVariables.filter(
    identifier => !availableParameters.has(identifier),
  );

  if (unresolvedVariables.length > 0) {
    errors.push(`Unresolved variables: ${unresolvedVariables.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    referencedVariables,
    unresolvedVariables,
  };
}

export function extractNpcComputeVariableReferences(expression: string): string[] {
  const references: string[] = [];

  try {
    const ast = parseExpression(expression);
    collectIdentifiers(ast, references);
  } catch {
    const matches = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    for (const match of matches) {
      if (!isNpcComputeNonParameterIdentifier(match) && !references.includes(match)) {
        references.push(match);
      }
    }
  }

  return references;
}

function collectIdentifiers(node: AstNode, references: string[]) {
  switch (node.type) {
    case "identifier":
      if (!isNpcComputeNonParameterIdentifier(node.name) && !references.includes(node.name)) {
        references.push(node.name);
      }
      return;
    case "unary":
      collectIdentifiers(node.operand, references);
      return;
    case "binary":
      collectIdentifiers(node.left, references);
      collectIdentifiers(node.right, references);
      return;
    case "call":
      for (const arg of node.args) {
        collectIdentifiers(arg, references);
      }
      return;
    case "array":
      for (const element of node.elements) {
        collectIdentifiers(element, references);
      }
      return;
    default:
      return;
  }
}

function parseExpression(expression: string): AstNode {
  const tokens = tokenize(expression);
  let index = 0;

  function peek(): Token {
    return tokens[index];
  }

  function advance(): Token {
    return tokens[index++];
  }

  function expect(type: TokenType): Token {
    const token = advance();
    if (token.type !== type) {
      throw new Error(`Expected ${TokenType[type]} but got ${TokenType[token.type]}`);
    }
    return token;
  }

  function parseInfixExpression(minPrecedence = 0): AstNode {
    let left = parsePrefixExpression();

    while (true) {
      const token = peek();
      const precedence = getInfixPrecedence(token.type);
      if (precedence < 0 || precedence < minPrecedence) {
        break;
      }

      advance();
      const right = parseInfixExpression(precedence + 1);
      left = { type: "binary", left, right };
    }

    return left;
  }

  function parsePrefixExpression(): AstNode {
    const token = peek();

    if (
      token.type === TokenType.Minus ||
      token.type === TokenType.Plus ||
      token.type === TokenType.LogicalNot ||
      token.type === TokenType.BitwiseNot
    ) {
      advance();
      return {
        type: "unary",
        operand: parsePrefixExpression(),
      };
    }

    if (token.type === TokenType.Number) {
      advance();
      return { type: "number", value: token.value as number };
    }

    if (token.type === TokenType.String) {
      advance();
      return { type: "string", value: token.value as string };
    }

    if (token.type === TokenType.Boolean) {
      advance();
      return { type: "boolean", value: token.value as boolean };
    }

    if (token.type === TokenType.OpenBracket) {
      advance();
      const elements: AstNode[] = [];
      if (peek().type !== TokenType.CloseBracket) {
        elements.push(parseInfixExpression());
        while (peek().type === TokenType.Comma) {
          advance();
          if (peek().type === TokenType.CloseBracket) {
            break;
          }
          elements.push(parseInfixExpression());
        }
      }
      expect(TokenType.CloseBracket);
      return { type: "array", elements };
    }

    if (token.type === TokenType.Identifier) {
      advance();
      const name = token.value as string;

      if (peek().type === TokenType.OpenParen) {
        advance();
        const args: AstNode[] = [];
        if (peek().type !== TokenType.CloseParen) {
          args.push(parseInfixExpression());
          while (peek().type === TokenType.Comma) {
            advance();
            args.push(parseInfixExpression());
          }
        }
        expect(TokenType.CloseParen);
        return { type: "call", args };
      }

      return { type: "identifier", name };
    }

    if (token.type === TokenType.OpenParen) {
      advance();
      const innerExpression = parseInfixExpression();
      expect(TokenType.CloseParen);
      return innerExpression;
    }

    throw new Error(
      `Unexpected token: ${TokenType[token.type]} (${String(token.value)}) at position ${token.start}`,
    );
  }

  const ast = parseInfixExpression();
  const trailingToken = peek();
  if (trailingToken.type !== TokenType.EOF) {
    throw new Error(
      `Unexpected token: ${TokenType[trailingToken.type]} (${String(trailingToken.value)}) at position ${trailingToken.start}`,
    );
  }

  return ast;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    if (/\s/.test(expression[index])) {
      index += 1;
      continue;
    }

    const start = index;
    const char = expression[index];

    if (
      /[0-9]/.test(char) ||
      (char === "." && index + 1 < expression.length && /[0-9]/.test(expression[index + 1]))
    ) {
      let value = "";
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        value += expression[index++];
      }
      if (index < expression.length && /[eE]/.test(expression[index])) {
        value += expression[index++];
        if (index < expression.length && /[+-]/.test(expression[index])) {
          value += expression[index++];
        }
        while (index < expression.length && /[0-9]/.test(expression[index])) {
          value += expression[index++];
        }
      }

      tokens.push({
        type: TokenType.Number,
        value: Number.parseFloat(value),
        start,
      });
      continue;
    }

    if (char === "\"" || char === "'") {
      const quote = char;
      index += 1;
      let value = "";
      while (index < expression.length && expression[index] !== quote) {
        if (expression[index] === "\\") {
          index += 1;
          value += expression[index] ?? "";
        } else {
          value += expression[index];
        }
        index += 1;
      }
      if (index < expression.length) {
        index += 1;
      }

      tokens.push({
        type: TokenType.String,
        value,
        start,
      });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let value = "";
      while (index < expression.length && /[a-zA-Z0-9_]/.test(expression[index])) {
        value += expression[index++];
      }

      if (value === "true") {
        tokens.push({ type: TokenType.Boolean, value: true, start });
      } else if (value === "false") {
        tokens.push({ type: TokenType.Boolean, value: false, start });
      } else {
        tokens.push({ type: TokenType.Identifier, value, start });
      }
      continue;
    }

    if (index + 1 < expression.length) {
      const twoCharOperator = expression.slice(index, index + 2);
      const twoCharTokenType = TWO_CHAR_OPERATORS[twoCharOperator];
      if (twoCharTokenType !== undefined) {
        tokens.push({ type: twoCharTokenType, value: twoCharOperator, start });
        index += 2;
        continue;
      }
    }

    const singleCharTokenType = SINGLE_CHAR_OPERATORS[char];
    if (singleCharTokenType !== undefined) {
      tokens.push({ type: singleCharTokenType, value: char, start });
      index += 1;
      continue;
    }

    index += 1;
  }

  tokens.push({
    type: TokenType.EOF,
    value: "",
    start: index,
  });

  return tokens;
}

const TWO_CHAR_OPERATORS: Record<string, TokenType> = {
  "**": TokenType.Exponent,
  ">=": TokenType.GreaterEqual,
  "<=": TokenType.LessEqual,
  "==": TokenType.Equal,
  "!=": TokenType.NotEqual,
  "&&": TokenType.LogicalAnd,
  "||": TokenType.LogicalOr,
};

const SINGLE_CHAR_OPERATORS: Record<string, TokenType> = {
  "+": TokenType.Plus,
  "-": TokenType.Minus,
  "*": TokenType.Multiply,
  "/": TokenType.Divide,
  "%": TokenType.Remainder,
  ">": TokenType.Greater,
  "<": TokenType.Less,
  "!": TokenType.LogicalNot,
  "~": TokenType.BitwiseNot,
  "&": TokenType.BitwiseAnd,
  "|": TokenType.BitwiseOr,
  "^": TokenType.BitwiseXor,
  "(": TokenType.OpenParen,
  ")": TokenType.CloseParen,
  "[": TokenType.OpenBracket,
  "]": TokenType.CloseBracket,
  ",": TokenType.Comma,
};

function getInfixPrecedence(type: TokenType): number {
  switch (type) {
    case TokenType.LogicalOr:
      return 1;
    case TokenType.LogicalAnd:
      return 2;
    case TokenType.BitwiseOr:
      return 3;
    case TokenType.BitwiseXor:
      return 4;
    case TokenType.BitwiseAnd:
      return 5;
    case TokenType.Equal:
    case TokenType.NotEqual:
      return 6;
    case TokenType.Greater:
    case TokenType.GreaterEqual:
    case TokenType.Less:
    case TokenType.LessEqual:
      return 7;
    case TokenType.Plus:
    case TokenType.Minus:
      return 9;
    case TokenType.Multiply:
    case TokenType.Divide:
    case TokenType.Remainder:
      return 10;
    case TokenType.Exponent:
      return 11;
    default:
      return -1;
  }
}
