export function makeDownloadBlob(content: string | ArrayBuffer, type: string): Blob {
  return new Blob([content], { type });
}

export function downloadName(prefix: string, timestamp: string, extension: string): string {
  return `${prefix}-${timestamp.replaceAll(':', '-').replaceAll('.', '-')}.${extension}`;
}
