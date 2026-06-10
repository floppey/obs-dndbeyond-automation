/**
 * Safe arithmetic expression evaluator for computed stats.
 *
 * Supports numbers, variable references, the operators + - * / %, unary minus,
 * parentheses, and a small set of math functions (floor, ceil, round, abs, min, max).
 *
 * This is intentionally NOT a general-purpose JS evaluator — no `eval`, no property
 * access, no function definitions. Only the grammar below is accepted, so expressions
 * from config.json cannot execute arbitrary code.
 *
 * Grammar (precedence low → high):
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/' | '%') factor)*
 *   factor     := ('-' factor) | primary
 *   primary    := NUMBER | IDENT | IDENT '(' args ')' | '(' expression ')'
 *   args       := expression (',' expression)*
 */

/** Math functions callable from an expression. Keys must be lowercase. */
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  abs: (x) => Math.abs(x),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
};

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

/** Split an expression string into tokens. Throws on unexpected characters. */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Number (integer or decimal)
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      const value = Number(num);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number "${num}"`);
      }
      tokens.push({ type: "number", value });
      continue;
    }

    // Identifier (variable or function name): letters, digits, underscore
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }

    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }

    if ("+-*/%".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }

  return tokens;
}

/**
 * Evaluate an arithmetic expression against a set of named numeric variables.
 *
 * @param expr      The expression string, e.g. "8 + proficiency + constitution_mod"
 * @param variables Map of variable name → numeric value
 * @returns The numeric result
 * @throws Error on syntax errors, unknown variables, or unknown functions
 */
export function evaluateExpression(
  expr: string,
  variables: Record<string, number>
): number {
  const tokens = tokenize(expr);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  function parseExpression(): number {
    let value = parseTerm();
    while (
      peek()?.type === "op" &&
      ((peek() as { value: string }).value === "+" ||
        (peek() as { value: string }).value === "-")
    ) {
      const op = next() as { value: string };
      value = op.value === "+" ? value + parseTerm() : value - parseTerm();
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (
      peek()?.type === "op" &&
      ["*", "/", "%"].includes((peek() as { value: string }).value)
    ) {
      const op = next() as { value: string };
      const rhs = parseFactor();
      if (op.value === "*") value *= rhs;
      else if (op.value === "/") value /= rhs;
      else value %= rhs;
    }
    return value;
  }

  function parseFactor(): number {
    const token = peek();
    if (token?.type === "op" && token.value === "-") {
      next();
      return -parseFactor();
    }
    if (token?.type === "op" && token.value === "+") {
      next();
      return parseFactor();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = next();
    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    if (token.type === "number") {
      return token.value;
    }

    if (token.type === "paren" && token.value === "(") {
      const value = parseExpression();
      const closing = next();
      if (closing?.type !== "paren" || closing.value !== ")") {
        throw new Error("Expected closing parenthesis");
      }
      return value;
    }

    if (token.type === "ident") {
      // Function call?
      if (peek()?.type === "paren" && (peek() as { value: string }).value === "(") {
        next(); // consume "("
        const fn = FUNCTIONS[token.value.toLowerCase()];
        if (!fn) {
          throw new Error(`Unknown function "${token.value}"`);
        }
        const args: number[] = [];
        if (!(peek()?.type === "paren" && (peek() as { value: string }).value === ")")) {
          args.push(parseExpression());
          while (peek()?.type === "comma") {
            next();
            args.push(parseExpression());
          }
        }
        const closing = next();
        if (closing?.type !== "paren" || closing.value !== ")") {
          throw new Error(`Expected closing parenthesis for "${token.value}("`);
        }
        return fn(...args);
      }

      // Variable reference
      if (!(token.value in variables)) {
        throw new Error(`Unknown variable "${token.value}"`);
      }
      return variables[token.value];
    }

    throw new Error(`Unexpected token in expression`);
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error("Unexpected trailing tokens in expression");
  }
  if (!Number.isFinite(result)) {
    throw new Error("Expression did not evaluate to a finite number");
  }
  return result;
}
