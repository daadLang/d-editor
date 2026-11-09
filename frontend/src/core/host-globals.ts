import * as React from "react"
import * as jsxRuntime from "react/jsx-runtime"

import { API_VERSION } from "@/core/api"

/**
 * Objects installed extensions share with the IDE. Extension bundles keep
 * `react` external and import it from /host/react.js, whose shim re-exports
 * these instances, so there is exactly one copy of React in the page.
 *
 * Must run before any extension is loaded.
 */
export function installHostGlobals() {
  ;(globalThis as Record<string, unknown>).__DAAD__ = {
    apiVersion: API_VERSION,
    react: React,
    jsxRuntime,
  }
}
