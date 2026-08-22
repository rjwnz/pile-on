/*
 * Registers the jest-dom matchers against `@jest/globals`' `expect`, rather
 * than the ambient global one. Tests import `expect` explicitly (better with
 * TypeScript, and it keeps `describe.only` lint rules honest), so this is the
 * entry point that supplies both the runtime matchers and their types.
 */
import '@testing-library/jest-dom/jest-globals';
