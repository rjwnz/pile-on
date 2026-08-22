/** Trigger a browser download of a text file. */
export function downloadText(
  filename: string,
  contents: string,
  mimeType = 'application/json',
): void {
  const blob = new Blob([contents], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `pile-on-2026-08-22.json` — sortable, and obvious in a downloads folder. */
export function stateFilename(now: Date): string {
  const iso = now.toISOString().slice(0, 10);
  return `pile-on-${iso}.json`;
}
