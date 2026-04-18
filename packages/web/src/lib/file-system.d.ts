declare global {
  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface SaveFilePickerOptions {
    excludeAcceptAllOption?: boolean;
    suggestedName?: string;
    types?: FilePickerAcceptType[];
  }

  interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    abort(reason?: unknown): Promise<void>;
    close(): Promise<void>;
    write(data: Blob | BufferSource | string): Promise<void>;
  }

  interface FileSystemFileHandle {
    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
  }

  interface Window {
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }
}

export {};
