import { describe, it, expect } from "vitest";
import { evaluateExpression } from "./expression.js";

describe("evaluateExpression", () => {
  const vars = {
    proficiency: 3,
    constitution_mod: 4,
    intelligence_mod: 2,
    level: 9,
    strength: 16,
  };

  it("evaluates basic arithmetic", () => {
    expect(evaluateExpression("1 + 2", {})).toBe(3);
    expect(evaluateExpression("2 * 3 + 4", {})).toBe(10);
    expect(evaluateExpression("2 + 3 * 4", {})).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4", {})).toBe(20);
    expect(evaluateExpression("10 - 4 - 3", {})).toBe(3);
    expect(evaluateExpression("10 / 2 / 5", {})).toBe(1);
    expect(evaluateExpression("10 % 3", {})).toBe(1);
  });

  it("handles unary minus", () => {
    expect(evaluateExpression("-5", {})).toBe(-5);
    expect(evaluateExpression("3 + -2", {})).toBe(1);
    expect(evaluateExpression("-(2 + 3)", {})).toBe(-5);
  });

  it("resolves variables", () => {
    expect(evaluateExpression("8 + proficiency + constitution_mod", vars)).toBe(15);
    expect(evaluateExpression("level * 2", vars)).toBe(18);
  });

  it("evaluates the hemomancer save DC", () => {
    // 8 + prof(3) + CON mod(4) = 15
    expect(evaluateExpression("8 + proficiency + constitution_mod", vars)).toBe(15);
  });

  it("supports math functions", () => {
    expect(evaluateExpression("floor(7 / 2)", {})).toBe(3);
    expect(evaluateExpression("ceil(7 / 2)", {})).toBe(4);
    expect(evaluateExpression("round(7 / 3)", {})).toBe(2);
    expect(evaluateExpression("abs(0 - 5)", {})).toBe(5);
    expect(evaluateExpression("max(1, 2, 3)", {})).toBe(3);
    expect(evaluateExpression("min(constitution_mod, intelligence_mod)", vars)).toBe(2);
    expect(evaluateExpression("max(8, 8 + intelligence_mod)", vars)).toBe(10);
  });

  it("ignores whitespace", () => {
    expect(evaluateExpression("  8   +proficiency", vars)).toBe(11);
  });

  it("throws on unknown variable", () => {
    expect(() => evaluateExpression("8 + wisdom_mod", vars)).toThrow(/Unknown variable/);
  });

  it("throws on unknown function", () => {
    expect(() => evaluateExpression("sqrt(4)", {})).toThrow(/Unknown function/);
  });

  it("throws on syntax errors", () => {
    expect(() => evaluateExpression("8 +", {})).toThrow();
    expect(() => evaluateExpression("(8 + 2", {})).toThrow(/parenthesis/);
    expect(() => evaluateExpression("8 8", {})).toThrow(/trailing/);
    expect(() => evaluateExpression("8 $ 2", {})).toThrow(/Unexpected character/);
  });

  it("rejects non-finite results", () => {
    expect(() => evaluateExpression("1 / 0", {})).toThrow(/finite/);
  });
});
