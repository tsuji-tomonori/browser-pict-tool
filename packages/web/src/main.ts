import "./styles.css";

import { formatSuite } from "./lib/engine";
import { exportToExcel } from "./lib/excel-export";
import type { Diagnostic, GeneratedSuite, UiOptions } from "./lib/engine";
import type { WorkerRequest, WorkerResponse } from "./lib/protocol";
import { SAMPLE_MODEL } from "./lib/sample-model";

type AppStatus = "idle" | "running" | "success" | "error" | "cancelled";
type SortDirection = "asc" | "desc";
type ExportFormat = "csv" | "tsv" | "md";

interface GenerationSnapshot {
  modelText: string;
  options: UiOptions;
}

interface SortState {
  columnIndex: number | null;
  direction: SortDirection;
}

interface ResizeState {
  columnIndex: number;
  startX: number;
  startWidth: number;
}

interface AppState {
  modelText: string;
  diagnostics: Diagnostic[];
  suite: GeneratedSuite | null;
  progress: number;
  stage: string;
  status: AppStatus;
  detail: string;
  filter: string;
  sort: SortState;
  columnWidths: number[];
  activeJobId: string | null;
  activeJobMode: "preview" | "stream" | null;
}

const MAX_RENDERED_RESULT_ROWS = 2000;
const STREAMING_DOWNLOAD_ROW_THRESHOLD = 1000;
const EXCEL_ROW_WARN_THRESHOLD = 50_000;

let pendingPreviewRequest: GenerationSnapshot | null = null;
let lastGeneratedRequest: GenerationSnapshot | null = null;
let activeStreamWritable: FileSystemWritableFileStream | null = null;
let activeStreamFormat: ExportFormat | null = null;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const worker = new Worker(new URL("./worker/worker.ts", import.meta.url), {
  type: "module",
});

const elements = {
  modelInput: requiredElement<HTMLTextAreaElement>("#model-input"),
  fileInput: requiredElement<HTMLInputElement>("#file-input"),
  loadSampleButton: requiredElement<HTMLButtonElement>("#load-sample-button"),
  loadFileButton: requiredElement<HTMLButtonElement>("#load-file-button"),
  clearModelButton: requiredElement<HTMLButtonElement>("#clear-model-button"),
  strengthInput: requiredElement<HTMLInputElement>("#strength-input"),
  caseSensitiveInput: requiredElement<HTMLInputElement>("#case-sensitive-input"),
  negativePrefixInput: requiredElement<HTMLInputElement>("#negative-prefix-input"),
  helpButtons: document.querySelectorAll<HTMLButtonElement>("[data-help-button]"),
  generateButton: requiredElement<HTMLButtonElement>("#generate-button"),
  cancelButton: requiredElement<HTMLButtonElement>("#cancel-button"),
  progressRoot: requiredElement<HTMLElement>(".progress"),
  progressBar: requiredElement<HTMLElement>("#progress-bar"),
  progressValue: requiredElement<HTMLElement>("#progress-value"),
  statusStage: requiredElement<HTMLElement>("#status-stage"),
  statusSummary: requiredElement<HTMLElement>("#status-summary"),
  statusDetail: requiredElement<HTMLElement>("#status-detail"),
  statsGrid: requiredElement<HTMLElement>("#stats-grid"),
  diagnosticsList: requiredElement<HTMLElement>("#diagnostics-list"),
  filterInput: requiredElement<HTMLInputElement>("#filter-input"),
  exportCsvButton: requiredElement<HTMLButtonElement>("#export-csv-button"),
  exportTsvButton: requiredElement<HTMLButtonElement>("#export-tsv-button"),
  exportMdButton: requiredElement<HTMLButtonElement>("#export-md-button"),
  exportExcelButton: requiredElement<HTMLButtonElement>("#export-excel-button"),
  resultsSummary: requiredElement<HTMLElement>("#results-summary"),
  resultsCaption: requiredElement<HTMLElement>("#results-caption"),
  resultsTableShell: requiredElement<HTMLElement>("#results-table-shell"),
  modelLineCount: requiredElement<HTMLElement>("#model-line-count"),
  modelSize: requiredElement<HTMLElement>("#model-size"),
  toast: requiredElement<HTMLElement>("#toast"),
};

const state: AppState = {
  modelText: SAMPLE_MODEL,
  diagnostics: [],
  suite: null,
  progress: 0,
  stage: "未実行",
  status: "idle",
  detail: "Worker は起動待機中です。",
  filter: "",
  sort: {
    columnIndex: null,
    direction: "asc",
  },
  columnWidths: [],
  activeJobId: null,
  activeJobMode: null,
};

let resizeState: ResizeState | null = null;
let toastTimer: number | undefined;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function numberFormat(value: number): string {
  return value.toLocaleString("ja-JP");
}

function integerStringFormat(value: string): string {
  try {
    return BigInt(value).toLocaleString("ja-JP");
  } catch {
    return value;
  }
}

function createJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadMimeType(format: ExportFormat): string {
  if (format === "csv") {
    return "text/csv;charset=utf-8";
  }

  if (format === "tsv") {
    return "text/tab-separated-values;charset=utf-8";
  }

  return "text/markdown;charset=utf-8";
}

function suiteFileName(extension: string): string {
  return `browser-pict-suite.${extension}`;
}

function downloadFileName(format: ExportFormat): string {
  return suiteFileName(format);
}

function downloadExcelFileName(): string {
  return suiteFileName("xlsx");
}

function triggerBlobDownload(content: string, format: ExportFormat): void {
  const blob =
    format === "csv"
      ? new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), content], {
          type: downloadMimeType(format),
        })
      : new Blob([content], {
          type: downloadMimeType(format),
        });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadFileName(format);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function canStreamToFile(): boolean {
  return typeof window.showSaveFilePicker === "function";
}

function currentOptions(): UiOptions {
  return {
    strength: Number(elements.strengthInput.value || 2),
    caseSensitive: elements.caseSensitiveInput.checked,
    negativePrefix: elements.negativePrefixInput.value || "~",
  };
}

function updateModelMetrics(): void {
  const lines = state.modelText.split(/\r?\n/);
  elements.modelLineCount.textContent = `${numberFormat(lines.length)} 行`;
  elements.modelSize.textContent = `${numberFormat(state.modelText.length)} 文字`;
}

function showToast(message: string): void {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 1800);
}

function setStatus(status: AppStatus, stage: string, detail = ""): void {
  state.status = status;
  state.stage = stage;
  state.detail = detail;

  elements.statusStage.textContent = stage;
  elements.statusDetail.textContent = detail;
  elements.statusSummary.textContent =
    status === "running"
      ? "実行中"
      : status === "success"
        ? "完了"
        : status === "error"
          ? "エラー"
          : status === "cancelled"
            ? "中断"
            : "待機中";
  elements.statusSummary.className = "status-chip";
  if (status === "running") {
    elements.statusSummary.classList.add("is-running");
  }
  if (status === "success") {
    elements.statusSummary.classList.add("is-success");
  }
  if (status === "error") {
    elements.statusSummary.classList.add("is-error");
  }
}

function setProgress(value: number): void {
  state.progress = Math.max(0, Math.min(100, value));
  elements.progressBar.style.width = `${state.progress}%`;
  elements.progressValue.textContent = `${state.progress}%`;
  elements.progressRoot.setAttribute("aria-valuenow", String(state.progress));
}

function resetResults(): void {
  state.suite = null;
  state.sort = { columnIndex: null, direction: "asc" };
  state.columnWidths = [];
  state.filter = "";
  lastGeneratedRequest = null;
  elements.filterInput.value = "";
  renderResults();
  renderStats();
}

function renderStats(): void {
  const stats = state.suite?.stats;
  const items: Array<[string, string]> = [
    ["総当たり件数", stats ? integerStringFormat(stats.bruteForceCaseCount) : "-"],
    ["削減件数", stats ? integerStringFormat(stats.reducedCaseCount) : "-"],
    ["削減率", stats ? stats.reductionRate : "-"],
    ["行数", stats ? numberFormat(stats.generatedRowCount) : "0"],
    ["候補行数", stats ? numberFormat(stats.candidateRowCount) : "0"],
    ["パラメータ", stats ? numberFormat(stats.parameterCount) : "0"],
    ["制約", stats ? numberFormat(stats.constraintCount) : "0"],
    ["strength", stats ? numberFormat(stats.strength) : "-"],
    ["生成時間", stats ? `${numberFormat(stats.generationTimeMs)} ms` : "-"],
    ["必要組数", stats ? numberFormat(stats.requiredTupleCount) : "-"],
    ["未達組数", stats ? numberFormat(stats.uncoveredTupleCount) : "-"],
  ];

  elements.statsGrid.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="stat-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderDiagnostics(): void {
  if (state.diagnostics.length === 0) {
    elements.diagnosticsList.innerHTML = `
      <div class="empty-state compact">
        <p>まだ診断はありません。</p>
      </div>
    `;
    return;
  }

  elements.diagnosticsList.innerHTML = state.diagnostics
    .map((diagnostic) => {
      const location = diagnostic.line
        ? `L${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ""}`
        : "global";

      return `
        <article class="diagnostic-item ${escapeHtml(diagnostic.severity)}">
          <div class="diagnostic-topline">
            <strong>${escapeHtml(
              diagnostic.severity === "error"
                ? "Error"
                : diagnostic.severity === "warning"
                  ? "Warning"
                  : "Info",
            )}</strong>
            <span class="diagnostic-code">${escapeHtml(diagnostic.code)}</span>
          </div>
          <div class="diagnostic-message">${escapeHtml(diagnostic.message)}</div>
          <div class="diagnostic-location">${escapeHtml(location)}</div>
          ${
            diagnostic.detail
              ? `<div class="diagnostic-location">${escapeHtml(diagnostic.detail)}</div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function getVisibleRows(): Array<{ row: string[]; originalIndex: number }> {
  if (!state.suite) {
    return [];
  }

  let rows = state.suite.rows.map((row, index) => ({ row, originalIndex: index }));

  if (state.filter.trim()) {
    const needle = state.filter.toLocaleLowerCase();
    rows = rows.filter(({ row }) => row.some((cell) => cell.toLocaleLowerCase().includes(needle)));
  }

  if (state.sort.columnIndex !== null) {
    const columnIndex = state.sort.columnIndex;
    const direction = state.sort.direction === "asc" ? 1 : -1;
    rows.sort((left, right) => {
      const a = left.row[columnIndex] ?? "";
      const b = right.row[columnIndex] ?? "";
      return a.localeCompare(b, "ja-JP", { numeric: true }) * direction;
    });
  }

  return rows;
}

function applyColumnWidths(): void {
  document.querySelectorAll<HTMLElement>("[data-col-index]").forEach((column) => {
    const index = Number(column.getAttribute("data-col-index"));
    const width = state.columnWidths[index];
    if (width) {
      column.style.width = `${width}px`;
      column.style.minWidth = `${width}px`;
    }
  });
}

function updateResultsSummary(visibleCount: number, renderedCount: number): void {
  if (!state.suite) {
    elements.resultsSummary.innerHTML = "";
    elements.resultsCaption.textContent = "生成結果を表形式で確認できます。";
    return;
  }

  elements.resultsCaption.textContent = `${numberFormat(state.suite.rows.length)} 行 / ${numberFormat(
    state.suite.header.length,
  )} 列`;
  elements.resultsSummary.innerHTML = `
    <span class="pill">表示行 ${numberFormat(visibleCount)}</span>
    <span class="pill">描画行 ${numberFormat(renderedCount)}</span>
    <span class="pill">総行数 ${numberFormat(state.suite.rows.length)}</span>
    <span class="pill">総当たり比 ${escapeHtml(state.suite.stats.reductionRate)} 削減</span>
    <span class="pill">並び順 ${
      state.sort.columnIndex === null
        ? "生成順"
        : `${escapeHtml(state.suite.header[state.sort.columnIndex])} / ${state.sort.direction}`
    }</span>
    <span class="pill">クリックでセル値をコピー</span>
  `;
}

function renderResults(): void {
  const canExport = Boolean(state.suite) && state.activeJobId === null;
  elements.exportCsvButton.disabled = !canExport;
  elements.exportTsvButton.disabled = !canExport;
  elements.exportMdButton.disabled = !canExport;
  elements.exportExcelButton.disabled = !canExport;

  if (!state.suite) {
    elements.resultsTableShell.innerHTML = `
      <div class="empty-state">
        <p>生成を実行すると、ここに行番号付きの結果テーブルが表示されます。</p>
      </div>
    `;
    updateResultsSummary(0, 0);
    return;
  }

  const rows = getVisibleRows();
  const renderedRows = rows.slice(0, MAX_RENDERED_RESULT_ROWS);
  updateResultsSummary(rows.length, renderedRows.length);

  if (state.columnWidths.length === 0) {
    state.columnWidths = state.suite.header.map((header) =>
      Math.max(120, Math.min(280, header.length * 22 + 80)),
    );
  }

  const headerMarkup = state.suite.header
    .map((header, index) => {
      const icon =
        state.sort.columnIndex === index ? (state.sort.direction === "asc" ? "↑" : "↓") : "↕";

      return `
        <th scope="col">
          <div class="column-header">
            <button class="sort-button" type="button" data-sort-index="${index}">
              <span>${escapeHtml(header)}</span>
              <span class="sort-icon">${icon}</span>
            </button>
            <span class="resize-handle" data-resize-index="${index}" aria-hidden="true"></span>
          </div>
        </th>
      `;
    })
    .join("");

  const bodyMarkup = renderedRows
    .map(
      ({ row, originalIndex }) => `
        <tr>
          <td class="row-number">${numberFormat(originalIndex + 1)}</td>
          ${row
            .map((cell) => `<td class="copyable" title="クリックでコピー">${escapeHtml(cell)}</td>`)
            .join("")}
        </tr>
      `,
    )
    .join("");

  const colMarkup = `
    <col style="width:72px; min-width:72px;" />
    ${state.columnWidths
      .map(
        (width, index) =>
          `<col data-col-index="${index}" style="width:${width}px; min-width:${width}px;" />`,
      )
      .join("")}
  `;

  elements.resultsTableShell.innerHTML = `
    ${
      rows.length > renderedRows.length
        ? `<div class="empty-state compact"><p>表示対象 ${numberFormat(
            rows.length,
          )} 行のうち先頭 ${numberFormat(
            renderedRows.length,
          )} 行のみ描画しています。絞り込みかエクスポートを使って確認してください。</p></div>`
        : ""
    }
    <div class="table-scroll">
      <table>
        <colgroup>${colMarkup}</colgroup>
        <thead>
          <tr>
            <th scope="col" class="row-number">#</th>
            ${headerMarkup}
          </tr>
        </thead>
        <tbody>
          ${
            bodyMarkup ||
            `<tr><td class="row-number">-</td><td colspan="${state.suite.header.length}" class="empty-state compact"><p>フィルタ条件に一致する行がありません。</p></td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  applyColumnWidths();
}

function renderAll(): void {
  updateModelMetrics();
  renderStats();
  renderDiagnostics();
  renderResults();
}

function beginGeneration(): void {
  const modelText = elements.modelInput.value;
  const options = currentOptions();
  state.modelText = modelText;
  state.diagnostics = [];
  resetResults();
  renderDiagnostics();

  const jobId = createJobId();
  pendingPreviewRequest = {
    modelText,
    options,
  };
  state.activeJobId = jobId;
  state.activeJobMode = "preview";
  setStatus("running", "生成を開始", "Worker 上でモデルを解析しています。");
  setProgress(0);
  elements.generateButton.disabled = true;
  elements.cancelButton.disabled = false;
  renderResults();

  const request: WorkerRequest = {
    type: "GENERATE",
    jobId,
    modelText,
    options,
    mode: "preview",
  };
  worker.postMessage(request);
}

function cancelGeneration(): void {
  if (!state.activeJobId) {
    return;
  }

  const request: WorkerRequest = {
    type: "CANCEL",
    jobId: state.activeJobId,
  };
  worker.postMessage(request);
}

function finalizeRun(): void {
  state.activeJobId = null;
  state.activeJobMode = null;
  elements.generateButton.disabled = false;
  elements.cancelButton.disabled = true;
  renderResults();
}

async function closeActiveStreamWritable(): Promise<void> {
  const writable = activeStreamWritable;
  activeStreamWritable = null;
  activeStreamFormat = null;
  if (!writable) {
    return;
  }

  try {
    await writable.close();
  } catch {
    return;
  }
}

async function abortActiveStreamWritable(): Promise<void> {
  const writable = activeStreamWritable;
  activeStreamWritable = null;
  activeStreamFormat = null;
  if (!writable) {
    return;
  }

  try {
    await writable.abort();
  } catch {
    try {
      await writable.close();
    } catch {
      return;
    }
  }
}

function streamRequestSnapshot(): GenerationSnapshot | null {
  return lastGeneratedRequest;
}

async function startStreamingDownload(format: ExportFormat): Promise<void> {
  const snapshot = streamRequestSnapshot();
  if (!state.suite) {
    return;
  }

  if (!snapshot) {
    triggerBlobDownload(formatSuite(state.suite, format), format);
    return;
  }

  if (!canStreamToFile()) {
    showToast("大きな結果はメモリを多く使います。");
    triggerBlobDownload(formatSuite(state.suite, format), format);
    return;
  }

  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: downloadFileName(format),
      types: [
        {
          description: format.toUpperCase(),
          accept: {
            [downloadMimeType(format)]: [`.${format}`],
          },
        },
      ],
    });
    const writable = await fileHandle.createWritable();
    const jobId = createJobId();

    activeStreamWritable = writable;
    activeStreamFormat = format;
    state.activeJobId = jobId;
    state.activeJobMode = "stream";
    setStatus("running", "保存を開始", "Worker から受け取った chunk をファイルへ書き出しています。");
    setProgress(0);
    elements.generateButton.disabled = true;
    elements.cancelButton.disabled = false;
    renderResults();

    const request: WorkerRequest = {
      type: "GENERATE",
      jobId,
      modelText: snapshot.modelText,
      options: snapshot.options,
      mode: "stream",
      format,
      previewLimit: 200,
      chunkRowLimit: 512,
    };
    worker.postMessage(request);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      showToast("保存をキャンセルしました。");
      return;
    }

    state.diagnostics = [
      {
        severity: "error",
        code: "FILE_PICKER_FAILURE",
        message: error instanceof Error ? error.message : "保存先を開けませんでした。",
      },
    ];
    setStatus("error", "保存失敗", "保存先の準備に失敗しました。");
    renderDiagnostics();
  }
}

async function downloadSuite(format: ExportFormat): Promise<void> {
  if (!state.suite) {
    return;
  }

  if (state.suite.rows.length > STREAMING_DOWNLOAD_ROW_THRESHOLD) {
    await startStreamingDownload(format);
    return;
  }

  const content = formatSuite(state.suite, format);
  triggerBlobDownload(content, format);
}

async function downloadExcelSuite(): Promise<void> {
  if (!state.suite) {
    return;
  }

  const visibleRows = getVisibleRows();
  if (visibleRows.length > EXCEL_ROW_WARN_THRESHOLD) {
    showToast(
      `Excel 出力は ${numberFormat(visibleRows.length)} 行のため時間とメモリを多く使います。処理は続行します。`,
    );
  }

  try {
    await exportToExcel(
      ["#", ...state.suite.header],
      visibleRows.map(({ row, originalIndex }) => [String(originalIndex + 1), ...row]),
      { fileName: downloadExcelFileName() },
    );
  } catch (error) {
    console.error(error);
    showToast("Excel の書き出しに失敗しました。");
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`コピーしました: ${text}`);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "absolute";
    fallback.style.left = "-9999px";
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
    showToast(`コピーしました: ${text}`);
  }
}

async function onWorkerMessage(event: MessageEvent<WorkerResponse>): Promise<void> {
  const message = event.data;
  if (message.jobId !== state.activeJobId) {
    return;
  }

  if (message.type === "PROGRESS") {
    setProgress(message.progress);
    setStatus("running", message.stage, "UI は操作可能なままです。");
    return;
  }

  if (message.type === "STREAM_START" || message.type === "STREAM_PREVIEW_ROWS") {
    return;
  }

  if (message.type === "GENERATE_OK") {
    finalizeRun();
    state.suite = message.suite;
    state.diagnostics = message.diagnostics;
    lastGeneratedRequest = message.suite ? pendingPreviewRequest : null;
    pendingPreviewRequest = null;
    if (message.suite) {
      state.columnWidths = message.suite.header.map((header) =>
        Math.max(120, Math.min(280, header.length * 22 + 80)),
      );
      setProgress(100);
      setStatus(
        message.diagnostics.some((entry) => entry.severity === "error") ? "error" : "success",
        "生成完了",
        message.suite.stats.uncoveredTupleCount > 0
          ? `未達組数 ${numberFormat(message.suite.stats.uncoveredTupleCount)}`
          : "必要な組み合わせをすべてカバーしました。",
      );
    } else {
      setProgress(100);
      setStatus("error", "生成失敗", "診断エリアを確認してください。");
    }
    renderAll();
    return;
  }

  if (message.type === "STREAM_CHUNK") {
    if (!activeStreamWritable) {
      return;
    }

    try {
      await activeStreamWritable.write(message.chunk);
      const ackRequest: WorkerRequest = {
        type: "STREAM_ACK",
        jobId: message.jobId,
        chunkId: message.chunkId,
      };
      worker.postMessage(ackRequest);
    } catch (error) {
      const cancelRequest: WorkerRequest = {
        type: "CANCEL",
        jobId: message.jobId,
      };
      worker.postMessage(cancelRequest);
      await abortActiveStreamWritable();
      finalizeRun();
      state.diagnostics = [
        ...state.diagnostics,
        {
          severity: "error",
          code: "FILE_WRITE_FAILURE",
          message: error instanceof Error ? error.message : "ファイルへ書き込めませんでした。",
        },
      ];
      setStatus("error", "保存失敗", "ファイルへ書き込めませんでした。");
      renderDiagnostics();
    }
    return;
  }

  if (message.type === "STREAM_COMPLETE") {
    const completedFormat = activeStreamFormat;
    await closeActiveStreamWritable();
    finalizeRun();
    setProgress(100);
    setStatus(
      message.diagnostics.some((entry) => entry.severity === "error") ? "error" : "success",
      "保存完了",
      `${numberFormat(message.stats.generatedRowCount)} 行を書き出しました。`,
    );
    showToast(`${downloadFileName(completedFormat ?? "csv")} を保存しました。`);
    return;
  }

  if (message.type === "CANCELLED") {
    const wasStream = state.activeJobMode === "stream";
    if (!wasStream) {
      pendingPreviewRequest = null;
    }
    if (wasStream) {
      await abortActiveStreamWritable();
    }
    finalizeRun();
    setStatus("cancelled", "処理を中断", "途中でキャンセルしました。");
    setProgress(0);
    showToast(wasStream ? "保存をキャンセルしました。" : "生成をキャンセルしました。");
    return;
  }

  const wasStream = state.activeJobMode === "stream";
  if (wasStream) {
    await abortActiveStreamWritable();
  } else {
    pendingPreviewRequest = null;
  }
  finalizeRun();
  state.diagnostics = message.diagnostics;
  setStatus(
    "error",
    wasStream ? "保存失敗" : "Worker エラー",
    wasStream ? "保存を継続できませんでした。" : "実行を継続できませんでした。",
  );
  renderDiagnostics();
}

function wireEvents(): void {
  worker.addEventListener("message", (event) => {
    void onWorkerMessage(event);
  });

  elements.helpButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const helpId = button.getAttribute("data-help-button");
      if (!helpId) {
        return;
      }

      const panel = document.getElementById(helpId);
      if (!panel) {
        return;
      }

      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
    });
  });

  elements.modelInput.addEventListener("input", () => {
    state.modelText = elements.modelInput.value;
    updateModelMetrics();
    if (!state.activeJobId && state.suite) {
      setStatus("idle", "モデルを編集中", "前回結果は古くなっているため、再生成してください。");
    }
  });

  elements.loadSampleButton.addEventListener("click", () => {
    state.modelText = SAMPLE_MODEL;
    elements.modelInput.value = SAMPLE_MODEL;
    state.diagnostics = [];
    resetResults();
    renderAll();
    showToast("RFC サンプルを読み込みました。");
  });

  elements.loadFileButton.addEventListener("click", () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener("change", async () => {
    const file = elements.fileInput.files?.[0];
    if (!file) {
      return;
    }

    state.modelText = await file.text();
    elements.modelInput.value = state.modelText;
    state.diagnostics = [];
    resetResults();
    renderAll();
    showToast(`${file.name} を読み込みました。`);
    elements.fileInput.value = "";
  });

  elements.clearModelButton.addEventListener("click", () => {
    state.modelText = "";
    elements.modelInput.value = "";
    state.diagnostics = [];
    resetResults();
    renderAll();
  });

  elements.generateButton.addEventListener("click", beginGeneration);
  elements.cancelButton.addEventListener("click", cancelGeneration);

  elements.filterInput.addEventListener("input", () => {
    state.filter = elements.filterInput.value;
    renderResults();
  });

  elements.exportCsvButton.addEventListener("click", () => {
    void downloadSuite("csv");
  });
  elements.exportTsvButton.addEventListener("click", () => {
    void downloadSuite("tsv");
  });
  elements.exportMdButton.addEventListener("click", () => {
    void downloadSuite("md");
  });
  elements.exportExcelButton.addEventListener("click", () => {
    void downloadExcelSuite();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !state.activeJobId) {
      event.preventDefault();
      beginGeneration();
    }

    if (event.key === "Escape" && state.activeJobId) {
      event.preventDefault();
      cancelGeneration();
    }
  });

  elements.resultsTableShell.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const sortTrigger = target.closest<HTMLElement>("[data-sort-index]");
    if (sortTrigger) {
      const columnIndex = Number(sortTrigger.dataset.sortIndex);
      if (Number.isNaN(columnIndex)) {
        return;
      }

      if (state.sort.columnIndex === columnIndex) {
        state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
      } else {
        state.sort.columnIndex = columnIndex;
        state.sort.direction = "asc";
      }
      renderResults();
      return;
    }

    const cell = target.closest<HTMLTableCellElement>("td.copyable");
    if (cell) {
      void copyToClipboard(cell.textContent ?? "");
    }
  });

  elements.resultsTableShell.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("[data-resize-index]")) {
      return;
    }

    const columnIndex = Number(target.dataset.resizeIndex);
    if (Number.isNaN(columnIndex)) {
      return;
    }

    event.preventDefault();
    resizeState = {
      columnIndex,
      startX: event.clientX,
      startWidth: state.columnWidths[columnIndex] ?? 160,
    };
    document.body.classList.add("is-resizing");
  });

  window.addEventListener("pointermove", (event) => {
    if (!resizeState) {
      return;
    }

    const width = Math.max(96, resizeState.startWidth + (event.clientX - resizeState.startX));
    state.columnWidths[resizeState.columnIndex] = width;
    applyColumnWidths();
  });

  window.addEventListener("pointerup", () => {
    if (!resizeState) {
      return;
    }

    resizeState = null;
    document.body.classList.remove("is-resizing");
  });
}

function initialize(): void {
  elements.modelInput.value = state.modelText;
  updateModelMetrics();
  setProgress(0);
  setStatus("idle", "未実行", "Worker は起動待機中です。");
  renderAll();
  wireEvents();
}

initialize();
