// Shim served at /host/jsx-runtime.js. Extensions are built with "jsx-runtime" marked
// external and mapped here (see docs/extension-development.md), so they share the
// IDE's own React instance. Hooks break if two copies of React are loaded.
// Generated from the exports of react@19.3.0; the IDE sets globalThis.__DAAD__
// before it loads any extension.
export const { Fragment, jsx, jsxs } = globalThis.__DAAD__.jsxRuntime
