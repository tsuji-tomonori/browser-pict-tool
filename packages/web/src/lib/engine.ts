export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  line?: number;
  column?: number;
  detail?: string;
}

export interface UiOptions {
  strength: number;
  caseSensitive: boolean;
  negativePrefix: string;
}

export interface GeneratedSuite {
  header: string[];
  rows: string[][];
  stats: {
    strength: number;
    parameterCount: number;
    constraintCount: number;
    generatedRowCount: number;
    generationTimeMs: number;
    uncoveredTupleCount: number;
    candidateRowCount: number;
    requiredTupleCount: number;
  };
  warnings: Diagnostic[];
}

export interface GenerateResult {
  suite: GeneratedSuite | null;
  diagnostics: Diagnostic[];
}

const TRUE = 1;
const FALSE = 0;
const UNKNOWN = -1;

type TruthValue = typeof TRUE | typeof FALSE | typeof UNKNOWN;
type ScalarValue = string | number;
type TokenType =
  | "("
  | ")"
  | ","
  | "{"
  | "}"
  | "param"
  | "string"
  | "number"
  | "identifier"
  | "operator"
  | "IF"
  | "THEN"
  | "ELSE"
  | "AND"
  | "OR"
  | "NOT"
  | "IN"
  | "LIKE"
  | "EOF";

interface Token {
  type: TokenType;
  value: string | number;
  line: number;
  column: number;
}

interface ParameterValue {
  id: string;
  raw: string;
  isNegative: boolean;
}

interface Parameter {
  key: string;
  id: string;
  displayName: string;
  values: ParameterValue[];
}

interface ParamOperand {
  type: "param";
  name: string;
  line: number;
  column: number;
}

interface LiteralOperand {
  type: "literal";
  value: ScalarValue;
  line: number;
  column: number;
}

type OperandNode = ParamOperand | LiteralOperand;

interface ComparisonNode {
  type: "comparison";
  left: OperandNode;
  operator: string;
  right: OperandNode;
}

interface InNode {
  type: "in";
  left: OperandNode;
  values: OperandNode[];
}

interface LikeNode {
  type: "like";
  left: OperandNode;
  right: OperandNode;
}

interface NotNode {
  type: "not";
  expression: ConstraintNode;
  line: number;
  column: number;
}

interface AndNode {
  type: "and";
  left: ConstraintNode;
  right: ConstraintNode;
  line: number;
  column: number;
}

interface OrNode {
  type: "or";
  left: ConstraintNode;
  right: ConstraintNode;
  line: number;
  column: number;
}

interface IfNode {
  type: "if";
  when: ConstraintNode;
  thenBranch: ConstraintNode;
  elseBranch: ConstraintNode | null;
  line: number;
  column: number;
}

type ConstraintNode = ComparisonNode | InNode | LikeNode | NotNode | AndNode | OrNode | IfNode;

interface ParsedConstraint {
  line: number;
  column: number;
  raw: string;
  expression: ConstraintNode;
}

interface ParsedModel {
  parameters: Parameter[];
  constraints: ParsedConstraint[];
  options: UiOptions;
  parameterIndex: Map<string, Parameter>;
}

interface ParseResult {
  model: ParsedModel;
  diagnostics: Diagnostic[];
  hasErrors: boolean;
}

interface CoverageRow {
  values: string[];
  valueIndices: number[];
  sortKey: string;
  coverKeys: string[];
  selected?: boolean;
}

function createDiagnostic(
  severity: DiagnosticSeverity,
  code: string,
  message: string,
  extra: Omit<Diagnostic, "severity" | "code" | "message"> = {},
): Diagnostic {
  return { severity, code, message, ...extra };
}

class ParseError extends Error {
  line?: number;
  column?: number;
  detail?: string;

  constructor(
    message: string,
    location: {
      line?: number;
      column?: number;
      detail?: string;
    } = {},
  ) {
    super(message);
    this.name = "ParseError";
    this.line = location.line;
    this.column = location.column;
    this.detail = location.detail;
  }
}

export class CancelledError extends Error {
  constructor(message = "Generation cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

function stripQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function splitDelimited(source: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === '"' && source[index - 1] !== "\\") {
      quoted = !quoted;
      current += character;
      continue;
    }

    if (!quoted && character === delimiter) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim() || source.endsWith(delimiter)) {
    values.push(current.trim());
  }

  return values.filter((value) => value.length > 0);
}

function normalizeComparable(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLocaleLowerCase();
}

function normalizeName(name: string, caseSensitive: boolean): string {
  return caseSensitive ? name : name.toLocaleLowerCase();
}

function tokenizeConstraint(line: string, lineNumber: number, startColumn: number): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const pushToken = (type: TokenType, value: string | number, column: number): void => {
    tokens.push({ type, value, line: lineNumber, column });
  };

  while (index < line.length) {
    const column = startColumn + index;
    const character = line[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === ";") {
      index += 1;
      continue;
    }

    if ("(),{}".includes(character)) {
      pushToken(character as TokenType, character, column);
      index += 1;
      continue;
    }

    if (character === "[") {
      const closing = line.indexOf("]", index + 1);
      if (closing === -1) {
        throw new ParseError("角括弧の閉じがありません。", { line: lineNumber, column });
      }

      const rawName = line.slice(index + 1, closing).trim();
      if (!rawName) {
        throw new ParseError("空のパラメータ参照は使えません。", { line: lineNumber, column });
      }

      pushToken("param", rawName, column);
      index = closing + 1;
      continue;
    }

    if (character === '"') {
      let cursor = index + 1;
      let escaped = false;

      while (cursor < line.length) {
        const current = line[cursor];
        if (current === '"' && !escaped) {
          break;
        }
        escaped = current === "\\" && !escaped;
        if (current !== "\\") {
          escaped = false;
        }
        cursor += 1;
      }

      if (cursor >= line.length) {
        throw new ParseError("文字列リテラルが閉じていません。", {
          line: lineNumber,
          column,
        });
      }

      pushToken("string", stripQuotes(line.slice(index, cursor + 1)), column);
      index = cursor + 1;
      continue;
    }

    const operatorMatch = line.slice(index).match(/^(<>|!=|<=|>=|=|<|>)/);
    if (operatorMatch) {
      pushToken("operator", operatorMatch[1], column);
      index += operatorMatch[1].length;
      continue;
    }

    const bareWordMatch = line.slice(index).match(/^[^\s(),{};]+/);
    if (!bareWordMatch) {
      throw new ParseError(`解釈できない文字です: ${character}`, {
        line: lineNumber,
        column,
      });
    }

    const rawValue = bareWordMatch[0];
    const upper = rawValue.toUpperCase();
    const keyword = new Set<TokenType>(["IF", "THEN", "ELSE", "AND", "OR", "NOT", "IN", "LIKE"]);

    if (keyword.has(upper as TokenType)) {
      pushToken(upper as TokenType, upper, column);
      index += rawValue.length;
      continue;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      pushToken("number", Number(rawValue), column);
      index += rawValue.length;
      continue;
    }

    pushToken("identifier", rawValue, column);
    index += rawValue.length;
  }

  pushToken("EOF", "EOF", startColumn + line.length);
  return tokens;
}

function parseConstraintTokens(tokens: Token[], lineNumber: number): ConstraintNode {
  let cursor = 0;

  const peek = (): Token => tokens[cursor];
  const match = (...types: TokenType[]): boolean => types.includes(peek().type);
  const consume = (type: TokenType, message: string): Token => {
    const token = peek();
    if (token.type !== type) {
      throw new ParseError(message, { line: token.line, column: token.column });
    }
    cursor += 1;
    return token;
  };

  const parseOperand = (): OperandNode => {
    const token = peek();
    if (token.type === "param") {
      cursor += 1;
      return { type: "param", name: String(token.value), line: token.line, column: token.column };
    }
    if (token.type === "string" || token.type === "identifier" || token.type === "number") {
      cursor += 1;
      return {
        type: "literal",
        value: token.value as ScalarValue,
        line: token.line,
        column: token.column,
      };
    }
    throw new ParseError("オペランドが必要です。", {
      line: token.line,
      column: token.column,
    });
  };

  const parseComparison = (): ConstraintNode => {
    if (match("(")) {
      consume("(", "開き括弧が必要です。");
      const nested = parseExpression();
      consume(")", "閉じ括弧が必要です。");
      return nested;
    }

    const left = parseOperand();

    if (match("IN")) {
      consume("IN", "IN が必要です。");
      const open = match("(")
        ? consume("(", "開始記号が必要です。")
        : consume("{", "開始記号が必要です。");
      const closeType: TokenType = open.type === "(" ? ")" : "}";
      const values: OperandNode[] = [];
      while (!match(closeType)) {
        values.push(parseOperand());
        if (match(",")) {
          consume(",", "区切りが必要です。");
          continue;
        }
        if (!match(closeType)) {
          const token = peek();
          throw new ParseError("IN の値一覧が不正です。", {
            line: token.line,
            column: token.column,
          });
        }
      }
      consume(closeType, "IN の閉じ記号が必要です。");
      return { type: "in", left, values };
    }

    if (match("LIKE")) {
      consume("LIKE", "LIKE が必要です。");
      return { type: "like", left, right: parseOperand() };
    }

    if (match("operator")) {
      const operator = String(consume("operator", "比較演算子が必要です。").value);
      return { type: "comparison", left, operator, right: parseOperand() };
    }

    throw new ParseError("比較演算子または IN / LIKE が必要です。", {
      line: lineNumber,
      column: peek().column,
    });
  };

  const parseNot = (): ConstraintNode => {
    if (match("NOT")) {
      const token = consume("NOT", "NOT が必要です。");
      return {
        type: "not",
        expression: parseNot(),
        line: token.line,
        column: token.column,
      };
    }
    return parseComparison();
  };

  const parseAnd = (): ConstraintNode => {
    let node = parseNot();
    while (match("AND")) {
      const token = consume("AND", "AND が必要です。");
      node = {
        type: "and",
        left: node,
        right: parseNot(),
        line: token.line,
        column: token.column,
      };
    }
    return node;
  };

  const parseExpression = (): ConstraintNode => {
    let node = parseAnd();
    while (match("OR")) {
      const token = consume("OR", "OR が必要です。");
      node = {
        type: "or",
        left: node,
        right: parseAnd(),
        line: token.line,
        column: token.column,
      };
    }
    return node;
  };

  const parseStatement = (): ConstraintNode => {
    if (match("IF")) {
      const token = consume("IF", "IF が必要です。");
      const when = parseExpression();
      consume("THEN", "THEN が必要です。");
      const thenBranch = parseExpression();
      let elseBranch: ConstraintNode | null = null;
      if (match("ELSE")) {
        consume("ELSE", "ELSE が必要です。");
        elseBranch = parseExpression();
      }
      return {
        type: "if",
        when,
        thenBranch,
        elseBranch,
        line: token.line,
        column: token.column,
      };
    }
    return parseExpression();
  };

  const statement = parseStatement();
  consume("EOF", "制約式の末尾が不正です。");
  return statement;
}

function collectParameterRefs(
  node: ConstraintNode | OperandNode | null,
  bucket: Set<string>,
): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (node.type === "param") {
    bucket.add(node.name);
    return;
  }

  Object.values(node).forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) =>
        collectParameterRefs((entry as ConstraintNode | OperandNode | null) ?? null, bucket),
      );
    } else if (value && typeof value === "object") {
      collectParameterRefs(value as ConstraintNode | OperandNode, bucket);
    }
  });
}

function normalizeValue(
  value: ScalarValue,
  options: Pick<UiOptions, "caseSensitive">,
): ScalarValue {
  if (typeof value === "string") {
    return normalizeComparable(value, options.caseSensitive);
  }
  return value;
}

function patternToRegex(pattern: ScalarValue, options: Pick<UiOptions, "caseSensitive">): RegExp {
  const escaped = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/%/g, ".*");

  return new RegExp(`^${escaped}$`, options.caseSensitive ? "" : "i");
}

function evaluateOperand(
  rawOperand: OperandNode,
  assignment: Map<string, string>,
  parameterIndex: Map<string, Parameter>,
  options: Pick<UiOptions, "caseSensitive">,
): ScalarValue | TruthValue {
  if (rawOperand.type === "literal") {
    return rawOperand.value;
  }

  const key = normalizeName(rawOperand.name, options.caseSensitive);
  const parameter = parameterIndex.get(key);
  if (!parameter) {
    return UNKNOWN;
  }
  return assignment.has(parameter.key) ? assignment.get(parameter.key)! : UNKNOWN;
}

function andTruth(left: TruthValue, right: TruthValue): TruthValue {
  if (left === FALSE || right === FALSE) {
    return FALSE;
  }
  if (left === UNKNOWN || right === UNKNOWN) {
    return UNKNOWN;
  }
  return TRUE;
}

function orTruth(left: TruthValue, right: TruthValue): TruthValue {
  if (left === TRUE || right === TRUE) {
    return TRUE;
  }
  if (left === UNKNOWN || right === UNKNOWN) {
    return UNKNOWN;
  }
  return FALSE;
}

function notTruth(value: TruthValue): TruthValue {
  if (value === TRUE) {
    return FALSE;
  }
  if (value === FALSE) {
    return TRUE;
  }
  return UNKNOWN;
}

function evaluateNode(
  node: ConstraintNode,
  assignment: Map<string, string>,
  parameterIndex: Map<string, Parameter>,
  options: Pick<UiOptions, "caseSensitive">,
): TruthValue {
  switch (node.type) {
    case "comparison": {
      const left = evaluateOperand(node.left, assignment, parameterIndex, options);
      const right = evaluateOperand(node.right, assignment, parameterIndex, options);
      if (left === UNKNOWN || right === UNKNOWN) {
        return UNKNOWN;
      }
      const leftValue = normalizeValue(left, options);
      const rightValue = normalizeValue(right, options);
      switch (node.operator) {
        case "=":
          return leftValue === rightValue ? TRUE : FALSE;
        case "<>":
        case "!=":
          return leftValue !== rightValue ? TRUE : FALSE;
        case "<":
          return leftValue < rightValue ? TRUE : FALSE;
        case ">":
          return leftValue > rightValue ? TRUE : FALSE;
        case "<=":
          return leftValue <= rightValue ? TRUE : FALSE;
        case ">=":
          return leftValue >= rightValue ? TRUE : FALSE;
        default:
          return UNKNOWN;
      }
    }
    case "in": {
      const left = evaluateOperand(node.left, assignment, parameterIndex, options);
      if (left === UNKNOWN) {
        return UNKNOWN;
      }
      const normalizedLeft = normalizeValue(left, options);
      let sawUnknown = false;
      for (const valueNode of node.values) {
        const value = evaluateOperand(valueNode, assignment, parameterIndex, options);
        if (value === UNKNOWN) {
          sawUnknown = true;
          continue;
        }
        if (normalizedLeft === normalizeValue(value, options)) {
          return TRUE;
        }
      }
      return sawUnknown ? UNKNOWN : FALSE;
    }
    case "like": {
      const left = evaluateOperand(node.left, assignment, parameterIndex, options);
      const right = evaluateOperand(node.right, assignment, parameterIndex, options);
      if (left === UNKNOWN || right === UNKNOWN) {
        return UNKNOWN;
      }
      return patternToRegex(right, options).test(String(left)) ? TRUE : FALSE;
    }
    case "not":
      return notTruth(evaluateNode(node.expression, assignment, parameterIndex, options));
    case "and":
      return andTruth(
        evaluateNode(node.left, assignment, parameterIndex, options),
        evaluateNode(node.right, assignment, parameterIndex, options),
      );
    case "or":
      return orTruth(
        evaluateNode(node.left, assignment, parameterIndex, options),
        evaluateNode(node.right, assignment, parameterIndex, options),
      );
    case "if": {
      const notWhen = notTruth(evaluateNode(node.when, assignment, parameterIndex, options));
      const thenValue = evaluateNode(node.thenBranch, assignment, parameterIndex, options);
      if (!node.elseBranch) {
        return orTruth(notWhen, thenValue);
      }
      const whenValue = evaluateNode(node.when, assignment, parameterIndex, options);
      const elseValue = evaluateNode(node.elseBranch, assignment, parameterIndex, options);
      return orTruth(andTruth(whenValue, thenValue), andTruth(notWhen, elseValue));
    }
  }
}

function chooseIndices(size: number, choose: number): number[][] {
  const results: number[][] = [];
  const current: number[] = [];

  const walk = (start: number): void => {
    if (current.length === choose) {
      results.push([...current]);
      return;
    }
    for (let index = start; index < size; index += 1) {
      current.push(index);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  return results;
}

function buildTupleKeys(rows: CoverageRow[], parameterSets: number[][]): Set<string> {
  const tupleUniverse = new Set<string>();

  rows.forEach((row) => {
    row.coverKeys = parameterSets.map((set) => {
      const key = set.map((index) => `${index}:${row.valueIndices[index]}`).join("|");
      tupleUniverse.add(key);
      return key;
    });
  });

  return tupleUniverse;
}

function coverTuples(
  rows: CoverageRow[],
  tupleUniverse: Set<string>,
  reportProgress: (progress: number, stage: string) => void,
  cancellation: { cancelled?: boolean },
): { selected: CoverageRow[]; uncovered: Set<string> } {
  const uncovered = new Set(tupleUniverse);
  const selected: CoverageRow[] = [];

  while (uncovered.size > 0) {
    if (cancellation.cancelled) {
      throw new CancelledError();
    }

    let bestRow: CoverageRow | null = null;
    let bestScore = -1;

    for (const row of rows) {
      if (row.selected) {
        continue;
      }

      let score = 0;
      for (const key of row.coverKeys) {
        if (uncovered.has(key)) {
          score += 1;
        }
      }

      if (!bestRow || score > bestScore || (score === bestScore && row.sortKey < bestRow.sortKey)) {
        bestRow = row;
        bestScore = score;
      }
    }

    if (!bestRow || bestScore <= 0) {
      break;
    }

    bestRow.selected = true;
    selected.push(bestRow);
    for (const key of bestRow.coverKeys) {
      uncovered.delete(key);
    }

    const coveredRatio = tupleUniverse.size === 0 ? 1 : 1 - uncovered.size / tupleUniverse.size;
    reportProgress(70 + Math.round(coveredRatio * 24), "未カバー組を解消");
  }

  return { selected, uncovered };
}

export function parseModel(modelText: string, userOptions: Partial<UiOptions> = {}): ParseResult {
  const normalizedText = String(modelText ?? "").replace(/\r\n?/g, "\n");
  const options: UiOptions = {
    strength: Number(userOptions.strength ?? 2),
    caseSensitive: Boolean(userOptions.caseSensitive),
    negativePrefix: String(userOptions.negativePrefix ?? "~") || "~",
  };

  const diagnostics: Diagnostic[] = [];
  const parameters: Parameter[] = [];
  const parameterIndex = new Map<string, Parameter>();
  const constraints: ParsedConstraint[] = [];
  const lines = normalizedText.split("\n");

  lines.forEach((line, lineOffset) => {
    const lineNumber = lineOffset + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const colonIndex = line.indexOf(":");
    const looksLikeParameter = colonIndex > 0 && !trimmed.toUpperCase().startsWith("IF ");

    if (looksLikeParameter) {
      const displayName = line.slice(0, colonIndex).trim();
      const rawValues = line.slice(colonIndex + 1).trim();
      const normalizedName = normalizeName(displayName, options.caseSensitive);

      if (!displayName) {
        diagnostics.push(
          createDiagnostic("error", "PARAMETER_NAME_REQUIRED", "パラメータ名が空です。", {
            line: lineNumber,
            column: 1,
          }),
        );
        return;
      }

      if (parameterIndex.has(normalizedName)) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "PARAMETER_DUPLICATE",
            `パラメータ "${displayName}" が重複しています。`,
            {
              line: lineNumber,
              column: 1,
            },
          ),
        );
        return;
      }

      const values = splitDelimited(rawValues, ",").map((rawValue, valueIndex) => {
        const displayValue = stripQuotes(rawValue.trim());
        return {
          id: `${normalizedName}:${valueIndex}`,
          raw: displayValue,
          isNegative: displayValue.startsWith(options.negativePrefix),
        };
      });

      if (values.length === 0) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "PARAMETER_EMPTY_VALUES",
            `パラメータ "${displayName}" に値がありません。`,
            {
              line: lineNumber,
              column: colonIndex + 2,
            },
          ),
        );
        return;
      }

      const parameter: Parameter = {
        key: displayName,
        id: normalizedName,
        displayName,
        values,
      };

      parameterIndex.set(normalizedName, parameter);
      parameters.push(parameter);
      return;
    }

    try {
      const startColumn = line.indexOf(trimmed) + 1;
      const tokens = tokenizeConstraint(trimmed, lineNumber, startColumn);
      const expression = parseConstraintTokens(tokens, lineNumber);
      constraints.push({
        line: lineNumber,
        column: startColumn,
        raw: trimmed,
        expression,
      });
    } catch (error) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "CONSTRAINT_PARSE_ERROR",
          error instanceof Error ? error.message : "制約を解析できませんでした。",
          {
            line: error instanceof ParseError ? error.line : lineNumber,
            column: error instanceof ParseError ? error.column : 1,
            detail: error instanceof ParseError ? error.detail : undefined,
          },
        ),
      );
    }
  });

  if (parameters.length === 0) {
    diagnostics.push(
      createDiagnostic("error", "MODEL_EMPTY", "少なくとも 1 つのパラメータ定義が必要です。"),
    );
  }

  if (!Number.isInteger(options.strength) || options.strength < 1) {
    diagnostics.push(
      createDiagnostic("error", "STRENGTH_INVALID", "strength は 1 以上の整数にしてください。"),
    );
  } else if (parameters.length > 0 && options.strength > parameters.length) {
    diagnostics.push(
      createDiagnostic(
        "error",
        "STRENGTH_TOO_LARGE",
        `strength=${options.strength} はパラメータ数 ${parameters.length} を超えています。`,
      ),
    );
  }

  constraints.forEach((constraint) => {
    const refs = new Set<string>();
    collectParameterRefs(constraint.expression, refs);
    refs.forEach((refName) => {
      const key = normalizeName(refName, options.caseSensitive);
      if (!parameterIndex.has(key)) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "PARAMETER_UNDEFINED",
            `制約で未定義パラメータ "${refName}" を参照しています。`,
            {
              line: constraint.line,
              column: constraint.column,
            },
          ),
        );
      }
    });
  });

  return {
    model: {
      parameters,
      constraints,
      options,
      parameterIndex,
    },
    diagnostics,
    hasErrors: diagnostics.some((entry) => entry.severity === "error"),
  };
}

export function generateSuite(
  modelText: string,
  userOptions: Partial<UiOptions> = {},
  reportProgress: (progress: number, stage: string) => void = () => undefined,
  cancellation: { cancelled?: boolean } = {},
): GenerateResult {
  const startedAt = Date.now();
  reportProgress(4, "モデルを解析");

  const parsed = parseModel(modelText, userOptions);
  if (parsed.hasErrors) {
    return {
      suite: null,
      diagnostics: parsed.diagnostics,
    };
  }

  const { model } = parsed;
  const totalSpace = model.parameters.reduce(
    (product, parameter) => product * parameter.values.length,
    1,
  );

  if (totalSpace > 250000) {
    return {
      suite: null,
      diagnostics: [
        ...parsed.diagnostics,
        createDiagnostic(
          "error",
          "MODEL_SPACE_TOO_LARGE",
          "この UI プロトタイプの探索上限を超えています。パラメータを分割するか値数を減らしてください。",
          {
            detail: `探索空間: ${totalSpace.toLocaleString()} combinations`,
          },
        ),
      ],
    };
  }

  reportProgress(12, "有効な候補行を探索");

  const assignment = new Map<string, string>();
  const validRows: CoverageRow[] = [];
  let visitedLeaves = 0;
  let nextProgressThreshold = 0;

  const enumerate = (depth: number, negativeCount: number): void => {
    if (cancellation.cancelled) {
      throw new CancelledError();
    }

    if (depth === model.parameters.length) {
      visitedLeaves += 1;
      const leafProgress = totalSpace === 0 ? 1 : visitedLeaves / totalSpace;
      if (leafProgress >= nextProgressThreshold) {
        reportProgress(12 + Math.round(leafProgress * 34), "有効な候補行を探索");
        nextProgressThreshold += 0.02;
      }

      const rowValues = model.parameters.map((parameter) => assignment.get(parameter.key) ?? "");
      const valueIndices = model.parameters.map((parameter) =>
        parameter.values.findIndex((value) => value.raw === assignment.get(parameter.key)),
      );

      validRows.push({
        values: rowValues,
        valueIndices,
        sortKey: rowValues.join("\u0001"),
        coverKeys: [],
      });
      return;
    }

    const parameter = model.parameters[depth];
    for (const value of parameter.values) {
      if (value.isNegative && negativeCount > 0) {
        continue;
      }

      assignment.set(parameter.key, value.raw);
      const isAllowed = model.constraints.every((constraint) => {
        const result = evaluateNode(
          constraint.expression,
          assignment,
          model.parameterIndex,
          model.options,
        );
        return result !== FALSE;
      });

      if (isAllowed) {
        enumerate(depth + 1, negativeCount + (value.isNegative ? 1 : 0));
      }

      assignment.delete(parameter.key);
    }
  };

  try {
    enumerate(0, 0);
  } catch (error) {
    if (error instanceof CancelledError) {
      throw error;
    }
    return {
      suite: null,
      diagnostics: [
        ...parsed.diagnostics,
        createDiagnostic("error", "GENERATION_FAILED", "候補行の生成に失敗しました。", {
          detail: error instanceof Error ? error.message : String(error),
        }),
      ],
    };
  }

  if (validRows.length === 0) {
    return {
      suite: null,
      diagnostics: [
        ...parsed.diagnostics,
        createDiagnostic(
          "error",
          "MODEL_UNSAT",
          "制約を満たす組み合わせが存在しません。モデル定義か制約を見直してください。",
        ),
      ],
    };
  }

  reportProgress(48, "必要な組を列挙");

  const parameterSets = chooseIndices(model.parameters.length, model.options.strength);
  const tupleUniverse = buildTupleKeys(validRows, parameterSets);

  reportProgress(68, "カバレッジを満たす行を選定");
  const { selected, uncovered } = coverTuples(
    validRows,
    tupleUniverse,
    reportProgress,
    cancellation,
  );

  const warnings = [...parsed.diagnostics];
  if (uncovered.size > 0) {
    warnings.push(
      createDiagnostic(
        "warning",
        "COVERAGE_PARTIAL",
        "一部の組み合わせを覆いきれませんでした。制約または値構成を確認してください。",
        { detail: `未達組数: ${uncovered.size.toLocaleString()}` },
      ),
    );
  }

  const suite: GeneratedSuite = {
    header: model.parameters.map((parameter) => parameter.displayName),
    rows: selected.map((row) => row.values),
    stats: {
      strength: model.options.strength,
      parameterCount: model.parameters.length,
      constraintCount: model.constraints.length,
      generatedRowCount: selected.length,
      generationTimeMs: Date.now() - startedAt,
      uncoveredTupleCount: uncovered.size,
      candidateRowCount: validRows.length,
      requiredTupleCount: tupleUniverse.size,
    },
    warnings,
  };

  reportProgress(100, "生成完了");
  return {
    suite,
    diagnostics: warnings,
  };
}

export function formatSuite(suite: GeneratedSuite, format: "csv" | "tsv" | "md"): string {
  const matrix = [suite.header, ...suite.rows];

  if (format === "tsv") {
    return matrix.map((row) => row.join("\t")).join("\n");
  }

  if (format === "csv") {
    const escapeCell = (cell: string): string => {
      if (/[",\n]/.test(cell)) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };
    return matrix.map((row) => row.map(escapeCell).join(",")).join("\n");
  }

  const escapeCell = (cell: string): string => cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

  const headerRow = `| ${suite.header.map(escapeCell).join(" | ")} |`;
  const dividerRow = `| ${suite.header.map(() => "---").join(" | ")} |`;
  const dataRows = suite.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`);
  return [headerRow, dividerRow, ...dataRows].join("\n");
}
