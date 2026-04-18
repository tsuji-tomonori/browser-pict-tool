import type { Diagnostic, GeneratedSuite, UiOptions } from "./engine";

export type GenerateFormat = "csv" | "tsv" | "md";

export type WorkerRequest =
  | {
      type: "GENERATE";
      jobId: string;
      modelText: string;
      options: UiOptions;
      mode: "preview" | "stream";
      format?: GenerateFormat;
      previewLimit?: number;
      chunkRowLimit?: number;
    }
  | {
      type: "CANCEL";
      jobId: string;
    }
  | {
      type: "STREAM_ACK";
      jobId: string;
      chunkId: number;
    };

export type StreamPreviewRow = readonly string[];

export type WorkerResponse =
  | {
      type: "PROGRESS";
      jobId: string;
      progress: number;
      stage: string;
    }
  | {
      type: "GENERATE_OK";
      jobId: string;
      suite: GeneratedSuite | null;
      diagnostics: Diagnostic[];
    }
  | {
      type: "STREAM_START";
      jobId: string;
      header: readonly string[];
      format: GenerateFormat;
    }
  | {
      type: "STREAM_PREVIEW_ROWS";
      jobId: string;
      rows: readonly StreamPreviewRow[];
      truncated: boolean;
    }
  | {
      type: "STREAM_CHUNK";
      jobId: string;
      chunkId: number;
      chunk: string;
    }
  | {
      type: "STREAM_COMPLETE";
      jobId: string;
      stats: GeneratedSuite["stats"];
      diagnostics: Diagnostic[];
    }
  | {
      type: "CANCELLED";
      jobId: string;
    }
  | {
      type: "ERROR";
      jobId: string;
      diagnostics: Diagnostic[];
    };
