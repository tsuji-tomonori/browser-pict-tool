import type { Diagnostic, SourceSpan } from "../diagnostics/types.ts";
import type {
  ModelDocument,
  NormalizedParseOptions,
  ParameterDefinition,
  ParameterValueDefinition,
  ParseModelResult,
  ParseOptions,
  SubmodelDefinition,
} from "../model/types.ts";
import { parseConstraints } from "./parse-constraints.ts";
import { SourceFile } from "./source-file.ts";

type LineRecord = {
  text: string;
  start: number;
  end: number;
};

type ModelSection = "parameters" | "submodels" | "constraints";

function normalizeSingleCharacterOption(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  if (value.length !== 1) {
    throw new Error(`Expected a single-character option, got: ${value}`);
  }
  return value;
}

export function normalizeParseOptions(options: ParseOptions = {}): NormalizedParseOptions {
  return {
    valueDelimiter: normalizeSingleCharacterOption(options.valueDelimiter, ","),
    aliasDelimiter: normalizeSingleCharacterOption(options.aliasDelimiter, "|"),
    negativePrefix: normalizeSingleCharacterOption(options.negativePrefix, "~"),
    caseSensitive: options.caseSensitive ?? false,
  };
}

function getLineRecords(source: string): LineRecord[] {
  const records: LineRecord[] = [];
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n") {
      continue;
    }

    const lineEnd = source[index - 1] === "\r" ? index - 1 : index;
    records.push({
      text: source.slice(start, lineEnd),
      start,
      end: lineEnd,
    });
    start = index + 1;
  }

  if (start <= source.length) {
    const lineEnd = source[source.length - 1] === "\r" ? source.length - 1 : source.length;
    records.push({
      text: source.slice(start, lineEnd),
      start,
      end: lineEnd,
    });
  }

  return records;
}

function trimWithOffsets(text: string, absoluteStart: number): { text: string; span: SourceSpan } {
  let start = 0;
  let end = text.length;

  while (start < end && /\s/u.test(text[start]!)) {
    start += 1;
  }
  while (end > start && /\s/u.test(text[end - 1]!)) {
    end -= 1;
  }

  return {
    text: text.slice(start, end),
    span: {
      start: absoluteStart + start,
      end: absoluteStart + end,
    },
  };
}

function splitByDelimiter(
  text: string,
  delimiter: string,
  absoluteStart: number,
): { raw: string; span: SourceSpan }[] {
  const parts: { raw: string; span: SourceSpan }[] = [];
  let tokenStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const isBoundary = index === text.length || text[index] === delimiter;
    if (!isBoundary) {
      continue;
    }

    parts.push({
      raw: text.slice(tokenStart, index),
      span: {
        start: absoluteStart + tokenStart,
        end: absoluteStart + index,
      },
    });

    tokenStart = index + 1;
  }

  return parts;
}

function isBlankLine(text: string): boolean {
  return text.trim().length === 0;
}

function isCommentLine(text: string): boolean {
  return text.trimStart().startsWith("#");
}

function isPotentialSubmodelLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") && trimmed.includes("}");
}

function isPotentialConstraintLine(text: string): boolean {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  if (!trimmed) {
    return false;
  }

  return (
    upper === "IF" ||
    upper.startsWith("IF ") ||
    upper.startsWith("IF[") ||
    upper.startsWith("IF(") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("(") ||
    upper.startsWith("NOT ") ||
    upper.startsWith("ISPOSITIVE") ||
    upper.startsWith("ISNEGATIVE")
  );
}

function namesEqual(left: string, right: string, caseSensitive: boolean): boolean {
  return caseSensitive ? left === right : left.toUpperCase() === right.toUpperCase();
}

class ModelParser {
  readonly sourceFile: SourceFile;
  readonly source: string;
  readonly options: NormalizedParseOptions;
  readonly diagnostics: Diagnostic[] = [];
  readonly lines: LineRecord[];

  constructor(source: string, options: ParseOptions = {}) {
    this.source = source;
    this.sourceFile = new SourceFile(source);
    this.options = normalizeParseOptions(options);
    this.lines = getLineRecords(source);
  }

  parse(): ParseModelResult {
    const parameters: ParameterDefinition[] = [];
    const submodels: SubmodelDefinition[] = [];

    let section: ModelSection = "parameters";
    let constraintStart: number | null = null;

    for (const line of this.lines) {
      if (isBlankLine(line.text) || isCommentLine(line.text)) {
        continue;
      }

      if (section === "parameters") {
        if (isPotentialSubmodelLine(line.text)) {
          section = "submodels";
          const submodel = this.parseSubmodelLine(line, parameters);
          if (submodel) {
            submodels.push(submodel);
          }
          continue;
        }

        if (isPotentialConstraintLine(line.text)) {
          section = "constraints";
          constraintStart = line.start;
          continue;
        }

        const parameter = this.parseParameterLine(line);
        if (parameter) {
          parameters.push(parameter);
        }
        continue;
      }

      if (section === "submodels") {
        if (isPotentialConstraintLine(line.text)) {
          section = "constraints";
          constraintStart = line.start;
          continue;
        }

        const submodel = this.parseSubmodelLine(line, parameters);
        if (submodel) {
          submodels.push(submodel);
        }
        continue;
      }

      if (constraintStart === null) {
        constraintStart = line.start;
      }
    }

    const constraints =
      constraintStart === null
        ? []
        : parseConstraints(this.sourceFile, constraintStart, this.source.length, this.diagnostics);

    const model: ModelDocument = {
      source: this.source,
      options: this.options,
      parameters,
      submodels,
      constraints,
      rawConstraintText: constraintStart === null ? "" : this.source.slice(constraintStart),
    };

    return {
      model,
      diagnostics: this.diagnostics,
    };
  }

  private parseParameterLine(line: LineRecord): ParameterDefinition | null {
    const separatorIndex = this.findParameterSeparator(line.text);

    if (separatorIndex < 0) {
      this.diagnostics.push(
        this.sourceFile.createDiagnostic(
          "parser.model.parameter_missing_separator",
          "error",
          "parameter 定義には少なくとも 1 つの値が必要です",
          { start: line.start, end: line.end },
        ),
      );
      return null;
    }

    const separator = line.text[separatorIndex] === ":" ? ":" : "delimiter";
    const rawName = line.text.slice(0, separatorIndex);
    const rawValues = line.text.slice(separatorIndex + 1);
    const { name, nameSpan, customOrder } = this.parseParameterName(rawName, line.start);

    const values = splitByDelimiter(
      rawValues,
      this.options.valueDelimiter,
      line.start + separatorIndex + 1,
    ).map((part) => this.parseParameterValue(part.raw, part.span));

    return {
      kind: "parameter",
      span: { start: line.start, end: line.end },
      nameSpan,
      name,
      separator,
      values,
      customOrder,
      isResultParameter: name.startsWith("$"),
    };
  }

  private parseParameterName(
    rawName: string,
    absoluteStart: number,
  ): {
    name: string;
    nameSpan: SourceSpan;
    customOrder?: number;
  } {
    const trimmed = trimWithOffsets(rawName, absoluteStart);
    const orderIndex = trimmed.text.lastIndexOf("@");

    if (orderIndex < 0) {
      return { name: trimmed.text, nameSpan: trimmed.span };
    }

    const before = trimmed.text.slice(0, orderIndex).trimEnd();
    const after = trimmed.text.slice(orderIndex + 1).trim();

    if (!/^\d+$/.test(after) || Number(after) <= 0) {
      return { name: trimmed.text, nameSpan: trimmed.span };
    }

    return {
      name: before,
      nameSpan: { start: trimmed.span.start, end: trimmed.span.start + before.length },
      customOrder: Number(after),
    };
  }

  private parseParameterValue(rawValue: string, span: SourceSpan): ParameterValueDefinition {
    const trimmed = trimWithOffsets(rawValue, span.start);
    let workingText = trimmed.text;
    let weight = 1;
    let explicitWeight = false;

    const referenceTarget =
      workingText.startsWith("<") && workingText.endsWith(">") && workingText.length >= 2
        ? workingText.slice(1, -1).trim()
        : undefined;

    if (!referenceTarget) {
      const weightMatch = workingText.match(/^(.*)\((\s*\d+\s*)\)\s*$/u);
      if (weightMatch) {
        const parsedWeight = Number(weightMatch[2].trim());
        if (Number.isInteger(parsedWeight) && parsedWeight > 0) {
          workingText = weightMatch[1].trimEnd();
          weight = parsedWeight;
          explicitWeight = true;
        }
      }
    }

    if (referenceTarget) {
      return {
        kind: "value",
        span: trimmed.span,
        rawText: trimmed.text,
        names: [workingText],
        primaryName: workingText,
        aliases: [],
        isNegative: false,
        weight,
        explicitWeight,
        source: "reference",
        referenceTarget,
      };
    }

    const nameParts = splitByDelimiter(
      workingText,
      this.options.aliasDelimiter,
      trimmed.span.start,
    ).map((part) => trimWithOffsets(part.raw, part.span.start).text);

    let isNegative = false;
    if (nameParts.length > 0 && nameParts[0].startsWith(this.options.negativePrefix)) {
      isNegative = true;
      nameParts[0] = nameParts[0].slice(this.options.negativePrefix.length).trim();
    }

    return {
      kind: "value",
      span: trimmed.span,
      rawText: trimmed.text,
      names: nameParts,
      primaryName: nameParts[0] ?? "",
      aliases: nameParts.slice(1),
      isNegative,
      weight,
      explicitWeight,
      source: "literal",
    };
  }

  private parseSubmodelLine(
    line: LineRecord,
    parameters: ParameterDefinition[],
  ): SubmodelDefinition | null {
    const trimmed = trimWithOffsets(line.text, line.start);
    const closingBrace = trimmed.text.indexOf("}");

    if (!trimmed.text.startsWith("{") || closingBrace < 0) {
      this.diagnostics.push(
        this.sourceFile.createDiagnostic(
          "parser.model.submodel_invalid",
          "error",
          "sub-model 定義が不正です",
          { start: line.start, end: line.end },
        ),
      );
      return null;
    }

    const inside = trimmed.text.slice(1, closingBrace).trim();
    if (!inside) {
      this.diagnostics.push(
        this.sourceFile.createDiagnostic(
          "parser.model.submodel_empty",
          "error",
          "sub-model には少なくとも 1 つの parameter が必要です",
          trimmed.span,
        ),
      );
      return null;
    }

    let parameterNames = inside.split(",").map((name) => name.trim());
    let usedValueDelimiterFallback = false;

    if (
      !this.allSubmodelNamesResolvable(parameterNames, parameters) &&
      this.options.valueDelimiter !== ","
    ) {
      const fallbackNames = inside.split(this.options.valueDelimiter).map((name) => name.trim());
      if (this.allSubmodelNamesResolvable(fallbackNames, parameters)) {
        parameterNames = fallbackNames;
        usedValueDelimiterFallback = true;
      }
    }

    if (!this.allSubmodelNamesResolvable(parameterNames, parameters)) {
      this.diagnostics.push(
        this.sourceFile.createDiagnostic(
          "parser.model.submodel_unknown_parameter",
          "warning",
          "sub-model に未知の parameter が含まれているため、この定義をスキップします",
          { start: line.start, end: line.end },
        ),
      );
      return null;
    }

    const deduplicated: string[] = [];
    let removedDuplicates = false;
    for (const name of parameterNames) {
      if (deduplicated.some((existing) => namesEqual(existing, name, this.options.caseSensitive))) {
        removedDuplicates = true;
        continue;
      }
      deduplicated.push(name);
    }

    if (removedDuplicates) {
      this.diagnostics.push(
        this.sourceFile.createDiagnostic(
          "parser.model.submodel_duplicate_parameter",
          "warning",
          "sub-model の重複 parameter を除去しました",
          { start: line.start, end: line.end },
        ),
      );
    }

    const remainder = trimmed.text.slice(closingBrace + 1).trim();
    let order: number | undefined;
    if (remainder) {
      const match = remainder.match(/^@\s*(\d+)$/u);
      if (!match || Number(match[1]) <= 0) {
        this.diagnostics.push(
          this.sourceFile.createDiagnostic(
            "parser.model.submodel_invalid_order",
            "error",
            "sub-model の order は正の整数で指定する必要があります",
            { start: line.start, end: line.end },
          ),
        );
        return null;
      }
      order = Number(match[1]);
    }

    return {
      kind: "submodel",
      span: { start: line.start, end: line.end },
      parameterNames: deduplicated,
      order,
      usedValueDelimiterFallback,
    };
  }

  private allSubmodelNamesResolvable(
    parameterNames: string[],
    parameters: ParameterDefinition[],
  ): boolean {
    return parameterNames.every((candidate) =>
      parameters.some((parameter) =>
        namesEqual(parameter.name, candidate, this.options.caseSensitive),
      ),
    );
  }

  private findParameterSeparator(text: string): number {
    const colonIndex = text.indexOf(":");
    if (colonIndex >= 0) {
      return colonIndex;
    }
    return text.indexOf(this.options.valueDelimiter);
  }
}

export function parseModelText(source: string, options: ParseOptions = {}): ParseModelResult {
  const parser = new ModelParser(source, options);
  return parser.parse();
}
