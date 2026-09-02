/// <reference types="vite/client" />

/**
 * Typed build-time configuration.
 *
 * Without this, `import.meta.env` is untyped and `tsc` fails even though `vite
 * build` succeeds — the compiler and the bundler disagree, and only one of them
 * runs in CI.
 */
interface ImportMetaEnv {
  /** Absolute API origin. Empty/unset keeps requests same-origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
