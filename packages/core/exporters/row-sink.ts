import type { StreamEncoder } from "./stream-encoder.ts";

export interface RowSink {
  writeHeader(header: readonly string[]): Promise<void> | void;
  writeRow(row: readonly string[]): Promise<void> | void;
  close(): Promise<void> | void;
}

const collectingHeaderSymbol = Symbol("collectingHeader");
const collectingRowsSymbol = Symbol("collectingRows");

export class CollectingSink implements RowSink {
  [collectingHeaderSymbol]: string[] = [];
  [collectingRowsSymbol]: string[][] = [];

  writeHeader(header: readonly string[]): void {
    this[collectingHeaderSymbol] = [...header];
  }

  writeRow(row: readonly string[]): void {
    this[collectingRowsSymbol].push([...row]);
  }

  close(): void {}
}

export function collectedHeader(sink: CollectingSink): readonly string[] {
  return sink[collectingHeaderSymbol];
}

export function collectedRows(sink: CollectingSink): readonly string[][] {
  return sink[collectingRowsSymbol];
}

const previewRowsSymbol = Symbol("previewRows");
const previewTruncatedSymbol = Symbol("previewTruncated");
const previewLimitSymbol = Symbol("previewLimit");

export class PreviewSink implements RowSink {
  [previewRowsSymbol]: string[][] = [];
  [previewTruncatedSymbol] = false;
  [previewLimitSymbol]: number;

  constructor(limit: number) {
    this[previewLimitSymbol] = Math.max(0, limit);
  }

  writeHeader(_header: readonly string[]): void {}

  writeRow(row: readonly string[]): void {
    if (this[previewRowsSymbol].length < this[previewLimitSymbol]) {
      this[previewRowsSymbol].push([...row]);
      return;
    }

    this[previewTruncatedSymbol] = true;
  }

  close(): void {}
}

export function previewRows(sink: PreviewSink): readonly string[][] {
  return sink[previewRowsSymbol];
}

export function previewIsTruncated(sink: PreviewSink): boolean {
  return sink[previewTruncatedSymbol];
}

export interface ChunkWriter {
  write(chunk: string): Promise<void> | void;
  close?(): Promise<void> | void;
}

export class FileSink implements RowSink {
  readonly writer: ChunkWriter;
  readonly encoder: StreamEncoder;

  constructor(writer: ChunkWriter, encoder: StreamEncoder) {
    this.writer = writer;
    this.encoder = encoder;
  }

  async writeHeader(header: readonly string[]): Promise<void> {
    await this.writer.write(this.encoder.encodeHeader(header));
  }

  async writeRow(row: readonly string[]): Promise<void> {
    await this.writer.write(this.encoder.encodeRow(row));
  }

  async close(): Promise<void> {
    await this.writer.write(this.encoder.encodeFooter());

    if (this.writer.close) {
      await this.writer.close();
    }
  }
}

export class CompositeSink implements RowSink {
  readonly sinks: RowSink[];

  constructor(sinks: RowSink[]) {
    this.sinks = sinks;
  }

  async writeHeader(header: readonly string[]): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.writeHeader(header)));
  }

  async writeRow(row: readonly string[]): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.writeRow(row)));
  }

  async close(): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.close()));
  }
}
