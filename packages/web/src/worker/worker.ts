/// <reference lib="WebWorker" />

import {
  CancelledError,
  CompositeSink,
  PreviewNotifySink,
  createChunkingSink,
  createCsvStreamEncoder,
  createMarkdownStreamEncoder,
  createTsvStreamEncoder,
  generateSuite,
  generateSuiteToSink,
} from "../lib/engine";
import type { AckControlledChunkSink, Diagnostic, RowSink, StreamEncoder } from "../lib/engine";
import type { GenerateFormat, WorkerRequest, WorkerResponse } from "../lib/protocol";

type JobState = {
  cancellation: { cancelled: boolean };
  chunkSink?: AckControlledChunkSink;
};

const jobs = new Map<string, JobState>();

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function postResponse(response: WorkerResponse): void {
  workerScope.postMessage(response);
}

function getEncoder(format: GenerateFormat): StreamEncoder {
  if (format === "tsv") {
    return createTsvStreamEncoder();
  }

  if (format === "md") {
    return createMarkdownStreamEncoder();
  }

  return createCsvStreamEncoder();
}

async function handlePreview(message: Extract<WorkerRequest, { type: "GENERATE" }>, job: JobState) {
  const result = generateSuite(
    message.modelText,
    message.options,
    (progress, stage) => {
      postResponse({
        type: "PROGRESS",
        jobId: message.jobId,
        progress,
        stage,
      });
    },
    job.cancellation,
  );

  postResponse({
    type: "GENERATE_OK",
    jobId: message.jobId,
    suite: result.suite,
    diagnostics: result.diagnostics,
  });
}

async function handleStream(message: Extract<WorkerRequest, { type: "GENERATE" }>, job: JobState) {
  const format = message.format ?? "csv";
  const previewLimit = message.previewLimit ?? 200;
  const chunkSink = createChunkingSink({
    encoder: getEncoder(format),
    chunkRowLimit: message.chunkRowLimit ?? 512,
    onChunk(chunkId, chunk) {
      postResponse({
        type: "STREAM_CHUNK",
        jobId: message.jobId,
        chunkId,
        chunk,
      });
    },
  });
  job.chunkSink = chunkSink;

  const previewSink = new PreviewNotifySink(previewLimit, (rows, truncated) => {
    postResponse({
      type: "STREAM_PREVIEW_ROWS",
      jobId: message.jobId,
      rows,
      truncated,
    });
  });
  const compositeSink = new CompositeSink([previewSink, chunkSink]);
  const streamSink: RowSink = {
    async writeHeader(header) {
      postResponse({
        type: "STREAM_START",
        jobId: message.jobId,
        header,
        format,
      });
      await compositeSink.writeHeader(header);
    },
    writeRow(row) {
      return compositeSink.writeRow(row);
    },
    close() {
      return compositeSink.close();
    },
  };

  const result = await generateSuiteToSink({
    modelText: message.modelText,
    options: message.options,
    sink: streamSink,
    cancellation: job.cancellation,
    onProgress(progress, stage) {
      postResponse({
        type: "PROGRESS",
        jobId: message.jobId,
        progress,
        stage,
      });
    },
  });

  if (!result.stats) {
    postResponse({
      type: "ERROR",
      jobId: message.jobId,
      diagnostics: result.diagnostics,
    });
    return;
  }

  postResponse({
    type: "STREAM_COMPLETE",
    jobId: message.jobId,
    stats: result.stats,
    diagnostics: result.diagnostics,
  });
}

async function handleGenerate(message: Extract<WorkerRequest, { type: "GENERATE" }>) {
  const job: JobState = {
    cancellation: { cancelled: false },
  };
  jobs.set(message.jobId, job);

  try {
    if (message.mode === "stream") {
      await handleStream(message, job);
      return;
    }

    await handlePreview(message, job);
  } catch (error) {
    if (error instanceof CancelledError) {
      postResponse({
        type: "CANCELLED",
        jobId: message.jobId,
      });
      return;
    }

    const diagnostics: Diagnostic[] = [
      {
        severity: "error",
        code: "WORKER_FAILURE",
        message: error instanceof Error ? error.message : "Worker 内で不明なエラーが発生しました。",
      },
    ];
    postResponse({
      type: "ERROR",
      jobId: message.jobId,
      diagnostics,
    });
  } finally {
    jobs.delete(message.jobId);
  }
}

workerScope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "CANCEL") {
    const job = jobs.get(message.jobId);
    if (job) {
      job.cancellation.cancelled = true;
      job.chunkSink?.cancelPending(new CancelledError());
    }
    return;
  }

  if (message.type === "STREAM_ACK") {
    jobs.get(message.jobId)?.chunkSink?.acknowledge(message.chunkId);
    return;
  }

  void handleGenerate(message);
});

export {};
