/*
 * Registers the jest-dom matchers against `@jest/globals`' `expect`, rather
 * than the ambient global one. Tests import `expect` explicitly (better with
 * TypeScript, and it keeps `describe.only` lint rules honest), so this is the
 * entry point that supplies both the runtime matchers and their types.
 */
import '@testing-library/jest-dom/jest-globals';

/*
 * jsdom does not implement `Blob.prototype.text()`, which every browser we
 * target has had since 2020. Polyfill it here rather than contorting the app
 * into using FileReader for a gap that only exists in the test environment.
 */
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
