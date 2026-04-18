import type { Diagnostic, GeneratedSuite, UiOptions } from "./engine";

export type WorkerRequest =
  | {
      type: "GENERATE";
      jobId: string;
      modelText: string;
      options: UiOptions;
    }
  | {
      type: "CANCEL";
      jobId: string;
    };

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
      type: "CANCELLED";
      jobId: string;
    }
  | {
      type: "ERROR";
      jobId: string;
      diagnostics: Diagnostic[];
    };
