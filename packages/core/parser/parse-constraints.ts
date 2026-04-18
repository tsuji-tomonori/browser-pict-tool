import type {
  ComparisonOperator,
  ComparisonPredicateNode,
  ComparisonRightHandSide,
  ConstraintDefinition,
  FunctionPredicateNode,
  LiteralNode,
  ParameterReferenceNode,
  PredicateNode,
  ValueSetNode,
} from "../model/types.ts";
import type { Diagnostic, SourceSpan } from "../diagnostics/types.ts";
import { SourceFile } from "./source-file.ts";

class ConstraintSyntaxError extends Error {
  readonly code: string;
  readonly span: SourceSpan;

  constructor(code: string, message: string, span: SourceSpan) {
    super(message);
    this.code = code;
    this.span = span;
  }
}

class ConstraintParser {
  readonly sourceFile: SourceFile;
  readonly source: string;
  readonly end: number;
  position: number;

  constructor(sourceFile: SourceFile, start: number, end: number) {
    this.sourceFile = sourceFile;
    this.source = sourceFile.text;
    this.position = start;
    this.end = end;
  }

  parseAll(): ConstraintDefinition[] {
    const constraints: ConstraintDefinition[] = [];

    this.skipTrivia();

    while (!this.isAtEnd()) {
      constraints.push(this.parseConstraint());
      this.skipTrivia();
    }

    return constraints;
  }

  private parseConstraint(): ConstraintDefinition {
    this.skipTrivia();
    const start = this.position;

    if (this.matchKeyword("IF")) {
      const condition = this.parsePredicate();
      this.expectKeyword("THEN", "parser.constraint.missing_then", "THEN が必要です");
      const consequent = this.parsePredicate();

      let alternative: PredicateNode | undefined;
      if (this.matchKeyword("ELSE")) {
        alternative = this.parsePredicate();
      }

      this.expectChar(
        ";",
        "parser.constraint.missing_semicolon",
        "constraint は ';' で終える必要があります",
      );

      const end = this.position;
      return {
        kind: "conditional",
        span: { start, end },
        rawText: this.source.slice(start, end),
        condition,
        consequent,
        alternative,
      };
    }

    const predicate = this.parsePredicate();
    this.expectChar(
      ";",
      "parser.constraint.missing_semicolon",
      "constraint は ';' で終える必要があります",
    );
    const end = this.position;

    return {
      kind: "invariant",
      span: { start, end },
      rawText: this.source.slice(start, end),
      predicate,
    };
  }

  private parsePredicate(): PredicateNode {
    return this.parseOrExpression();
  }

  private parseOrExpression(): PredicateNode {
    let left = this.parseAndExpression();

    while (true) {
      const operatorStart = this.position;
      if (!this.matchKeyword("OR")) {
        break;
      }

      const right = this.parseAndExpression();
      left = {
        kind: "logical",
        operator: "OR",
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };

      if (operatorStart === this.position) {
        break;
      }
    }

    return left;
  }

  private parseAndExpression(): PredicateNode {
    let left = this.parseUnaryExpression();

    while (true) {
      const operatorStart = this.position;
      if (!this.matchKeyword("AND")) {
        break;
      }

      const right = this.parseUnaryExpression();
      left = {
        kind: "logical",
        operator: "AND",
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };

      if (operatorStart === this.position) {
        break;
      }
    }

    return left;
  }

  private parseUnaryExpression(): PredicateNode {
    this.skipTrivia();
    const start = this.position;

    if (this.matchKeyword("NOT")) {
      const operand = this.parseUnaryExpression();
      return {
        kind: "not",
        operand,
        span: { start, end: operand.span.end },
      };
    }

    if (this.peekChar() === "(") {
      this.position += 1;
      const expression = this.parsePredicate();
      this.expectChar(")", "parser.constraint.missing_closing_paren", "閉じ括弧 ')' が必要です");
      return expression;
    }

    return this.parseTermOrFunction();
  }

  private parseTermOrFunction(): PredicateNode {
    this.skipTrivia();

    const functionName = this.tryMatchFunctionName();
    if (functionName) {
      return this.parseFunctionCall(functionName);
    }

    return this.parseComparison();
  }

  private parseFunctionCall(functionName: "IsPositive" | "IsNegative"): FunctionPredicateNode {
    this.skipTrivia();
    const start = this.position;
    this.position += functionName.length;
    this.skipTrivia();

    this.expectChar("(", "parser.constraint.function_missing_open", "関数の '(' が必要です");
    this.skipTrivia();

    let parameterName: string | undefined;
    let parameterNameSpan: SourceSpan | undefined;

    if (this.peekChar() !== ")") {
      const nameStart = this.position;
      const raw = this.readUntilUnescaped(")");
      parameterName = raw.trim();
      parameterNameSpan = { start: nameStart, end: nameStart + raw.length };
    }

    this.expectChar(")", "parser.constraint.function_missing_close", "関数の ')' が必要です");

    return {
      kind: "function",
      functionName,
      parameterName,
      parameterNameSpan,
      span: { start, end: this.position },
    };
  }

  private parseComparison(): ComparisonPredicateNode {
    const left = this.parseParameterReference();
    const operator = this.parseOperator();
    const right = this.parseRightHandSide(operator);

    return {
      kind: "comparison",
      left,
      operator,
      right,
      span: { start: left.span.start, end: right.span.end },
    };
  }

  private parseRightHandSide(operator: ComparisonOperator): ComparisonRightHandSide {
    this.skipTrivia();

    if (operator === "LIKE" || operator === "NOT LIKE") {
      return this.parseStringLiteral();
    }

    if (operator === "IN" || operator === "NOT IN") {
      return this.parseValueSet();
    }

    if (this.peekChar() === "[") {
      return this.parseParameterReference();
    }

    return this.parseLiteral();
  }

  private parseValueSet(): ValueSetNode {
    this.skipTrivia();
    const start = this.position;
    this.expectChar("{", "parser.constraint.valueset_open", "値集合は '{' で始める必要があります");

    this.skipTrivia();
    if (this.peekChar() === "}") {
      throw new ConstraintSyntaxError(
        "parser.constraint.valueset_empty",
        "空の値集合は使えません",
        { start, end: Math.min(this.position + 1, this.end) },
      );
    }

    const values: LiteralNode[] = [];
    values.push(this.parseLiteral());

    while (true) {
      this.skipTrivia();
      if (this.peekChar() !== ",") {
        break;
      }
      this.position += 1;
      values.push(this.parseLiteral());
    }

    this.expectChar("}", "parser.constraint.valueset_close", "値集合は '}' で閉じる必要があります");
    return {
      kind: "value_set",
      span: { start, end: this.position },
      values,
    };
  }

  private parseLiteral(): LiteralNode {
    this.skipTrivia();
    if (this.peekChar() === '"') {
      return this.parseStringLiteral();
    }
    return this.parseNumberLiteral();
  }

  private parseStringLiteral(): LiteralNode {
    this.skipTrivia();
    const start = this.position;
    this.expectChar('"', "parser.constraint.string_open", "文字列は '\"' で始める必要があります");
    const value = this.readDelimitedText('"');
    this.expectChar('"', "parser.constraint.string_close", "文字列は '\"' で閉じる必要があります");

    return {
      kind: "string_literal",
      value,
      span: { start, end: this.position },
    };
  }

  private parseNumberLiteral(): LiteralNode {
    this.skipTrivia();
    const start = this.position;
    const remaining = this.source.slice(this.position, this.end);
    const match = remaining.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);

    if (!match) {
      throw new ConstraintSyntaxError("parser.constraint.invalid_number", "数値が必要です", {
        start,
        end: Math.min(start + 1, this.end),
      });
    }

    const raw = match[0];
    this.position += raw.length;

    return {
      kind: "number_literal",
      value: Number(raw),
      raw,
      span: { start, end: this.position },
    };
  }

  private parseParameterReference(): ParameterReferenceNode {
    this.skipTrivia();
    const start = this.position;
    this.expectChar(
      "[",
      "parser.constraint.parameter_open",
      "parameter 参照は '[' で始める必要があります",
    );
    const name = this.readDelimitedText("]");
    this.expectChar(
      "]",
      "parser.constraint.parameter_close",
      "parameter 参照は ']' で閉じる必要があります",
    );

    return {
      kind: "parameter_reference",
      name,
      span: { start, end: this.position },
    };
  }

  private parseOperator(): ComparisonOperator {
    this.skipTrivia();
    const start = this.position;

    if (this.source.startsWith(">=", this.position)) {
      this.position += 2;
      return ">=";
    }
    if (this.source.startsWith("<=", this.position)) {
      this.position += 2;
      return "<=";
    }
    if (this.source.startsWith("<>", this.position)) {
      this.position += 2;
      return "<>";
    }
    if (this.peekChar() === "=") {
      this.position += 1;
      return "=";
    }
    if (this.peekChar() === ">") {
      this.position += 1;
      return ">";
    }
    if (this.peekChar() === "<") {
      this.position += 1;
      return "<";
    }

    if (this.matchKeyword("NOT")) {
      if (this.matchKeyword("LIKE")) {
        return "NOT LIKE";
      }
      if (this.matchKeyword("IN")) {
        return "NOT IN";
      }

      throw new ConstraintSyntaxError(
        "parser.constraint.invalid_operator",
        "NOT の後には LIKE または IN が必要です",
        { start, end: this.position },
      );
    }

    if (this.matchKeyword("LIKE")) {
      return "LIKE";
    }
    if (this.matchKeyword("IN")) {
      return "IN";
    }

    throw new ConstraintSyntaxError("parser.constraint.invalid_operator", "比較演算子が必要です", {
      start,
      end: Math.min(start + 1, this.end),
    });
  }

  private tryMatchFunctionName(): "IsPositive" | "IsNegative" | null {
    if (this.startsWithKeyword("ISPOSITIVE")) {
      return "IsPositive";
    }
    if (this.startsWithKeyword("ISNEGATIVE")) {
      return "IsNegative";
    }
    return null;
  }

  private readDelimitedText(terminator: "]" | '"'): string {
    let value = "";

    while (!this.isAtEnd()) {
      const char = this.source[this.position];

      if (char === terminator) {
        return value;
      }

      if (char === "\\") {
        const next = this.source[this.position + 1];
        if (next !== "\\" && next !== '"' && next !== "]") {
          throw new ConstraintSyntaxError(
            "parser.constraint.invalid_escape",
            "未対応のエスケープです",
            { start: this.position, end: Math.min(this.position + 2, this.end) },
          );
        }
        value += next;
        this.position += 2;
        continue;
      }

      value += char;
      this.position += 1;
    }

    throw new ConstraintSyntaxError(
      terminator === '"'
        ? "parser.constraint.string_unterminated"
        : "parser.constraint.parameter_unterminated",
      terminator === '"' ? "文字列が閉じられていません" : "parameter 参照が閉じられていません",
      { start: Math.max(0, this.position - 1), end: this.position },
    );
  }

  private readUntilUnescaped(terminator: string): string {
    const start = this.position;

    while (!this.isAtEnd()) {
      const char = this.source[this.position];
      if (char === terminator) {
        return this.source.slice(start, this.position);
      }
      this.position += 1;
    }

    throw new ConstraintSyntaxError(
      "parser.constraint.function_missing_close",
      "関数の ')' が必要です",
      { start, end: this.position },
    );
  }

  private expectKeyword(keyword: string, code: string, message: string): void {
    if (!this.matchKeyword(keyword)) {
      throw new ConstraintSyntaxError(code, message, {
        start: this.position,
        end: Math.min(this.position + keyword.length, this.end),
      });
    }
  }

  private expectChar(char: string, code: string, message: string): void {
    this.skipTrivia();
    if (this.peekChar() !== char) {
      throw new ConstraintSyntaxError(code, message, {
        start: this.position,
        end: Math.min(this.position + 1, this.end),
      });
    }
    this.position += 1;
  }

  private matchKeyword(keyword: string): boolean {
    this.skipTrivia();
    if (!this.startsWithKeyword(keyword)) {
      return false;
    }
    this.position += keyword.length;
    return true;
  }

  private startsWithKeyword(keyword: string): boolean {
    const end = this.position + keyword.length;
    if (end > this.end) {
      return false;
    }

    const candidate = this.source.slice(this.position, end);
    if (candidate.localeCompare(keyword, undefined, { sensitivity: "accent" }) !== 0) {
      if (candidate.toUpperCase() !== keyword.toUpperCase()) {
        return false;
      }
    }

    const next = this.source[end];
    return !next || !/[A-Za-z0-9_]/.test(next);
  }

  private skipTrivia(): void {
    while (!this.isAtEnd()) {
      const char = this.source[this.position];

      if (/\s/u.test(char)) {
        this.position += 1;
        continue;
      }

      if (char === "#" && this.isAtLineCommentStart(this.position)) {
        while (!this.isAtEnd() && this.source[this.position] !== "\n") {
          this.position += 1;
        }
        continue;
      }

      break;
    }
  }

  private isAtLineCommentStart(index: number): boolean {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const char = this.source[cursor];
      if (char === "\n") {
        return true;
      }
      if (char === "\r" || char === " " || char === "\t") {
        continue;
      }
      return false;
    }
    return true;
  }

  private peekChar(): string {
    return this.source[this.position] ?? "";
  }

  private isAtEnd(): boolean {
    return this.position >= this.end;
  }
}

export function parseConstraints(
  sourceFile: SourceFile,
  start: number,
  end: number,
  diagnostics: Diagnostic[],
): ConstraintDefinition[] {
  const parser = new ConstraintParser(sourceFile, start, end);

  try {
    return parser.parseAll();
  } catch (error) {
    if (error instanceof ConstraintSyntaxError) {
      diagnostics.push(sourceFile.createDiagnostic(error.code, "error", error.message, error.span));
      return [];
    }

    throw error;
  }
}
