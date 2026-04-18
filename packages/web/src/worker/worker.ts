/// <reference lib="WebWorker" />

import { CancelledError, generateSuite } from "../lib/engine";
import type { Diagnostic } from "../lib/engine";
import type { WorkerRequest, WorkerResponse } from "../lib/protocol";

const jobs = new Map<string, { cancelled: boolean }>();

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "CANCEL") {
    const token = jobs.get(message.jobId);
    if (token) {
      token.cancelled = true;
    }
    return;
  }

  const cancellation = { cancelled: false };
  jobs.set(message.jobId, cancellation);

  try {
    const result = generateSuite(
      message.modelText,
      message.options,
      (progress, stage) => {
        const response: WorkerResponse = {
          type: "PROGRESS",
          jobId: message.jobId,
          progress,
          stage,
        };
        workerScope.postMessage(response);
      },
      cancellation,
    );

    const response: WorkerResponse = {
      type: "GENERATE_OK",
      jobId: message.jobId,
      suite: result.suite,
      diagnostics: result.diagnostics,
    };
    workerScope.postMessage(response);
  } catch (error) {
    if (error instanceof CancelledError) {
      const response: WorkerResponse = {
        type: "CANCELLED",
        jobId: message.jobId,
      };
      workerScope.postMessage(response);
      return;
    }

    const diagnostics: Diagnostic[] = [
      {
        severity: "error",
        code: "WORKER_FAILURE",
        message: error instanceof Error ? error.message : "Worker 内で不明なエラーが発生しました。",
      },
    ];
    const response: WorkerResponse = {
      type: "ERROR",
      jobId: message.jobId,
      diagnostics,
    };
    workerScope.postMessage(response);
  } finally {
    jobs.delete(message.jobId);
  }
});

export {};
