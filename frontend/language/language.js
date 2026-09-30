/**
 * language.js — Daad (ض) CodeMirror 6 language support
 *
 * Wraps the stream parser in a StreamLanguage so CodeMirror can use it
 * as a first-class LanguageSupport extension, exactly like any other CM6
 * language package.
 *
 * Why StreamLanguage instead of LRLanguage + Lezer?
 * -------------------------------------------------
 * The Lezer Python parser classifies tokens by *structural role* (IfStatement,
 * FunctionDefinition, …). The Arabic keywords are never in those node names,
 * so `styleTags()` on an LRLanguage can never reach them.  StreamLanguage
 * lets us return a token class string directly from the tokenizer, which is
 * exactly what we need for keyword-level matching in any script.
 */

import { StreamLanguage, LanguageSupport } from '@codemirror/language';
import { daadStreamParser } from './parser.js';
import { daadCompletions } from './autocomplete.js';
import { autocompletion } from '@codemirror/autocomplete';

// ── language definition ──────────────────────────────────────────────────────

/**
 * The core Daad StreamLanguage.
 * Exported so callers can use it with `syntaxHighlighting`, tree queries, etc.
 */
export const daadLanguage = StreamLanguage.define(daadStreamParser);

// ── language support factory ─────────────────────────────────────────────────

/**
 * daad() — returns a LanguageSupport value ready to be added to an EditorView.
 *
 * Usage:
 *   import { daad } from './language.js';
 *   new EditorView({ extensions: [basicSetup, daad()] });
 */
export function daad() {
  return new LanguageSupport(daadLanguage, [
    // Keyword + local-identifier completion
    autocompletion({ override: [daadCompletions] }),
  ]);
}