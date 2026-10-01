/**
 * Stream parser for ض (Daad).
 *
 * A StreamLanguage tokenizer is used instead of a Lezer grammar because the
 * keywords are Arabic words: a tokenizer can classify them directly, which a
 * structural parser (e.g. the Python one) never could.
 */
import type { StreamParser } from "@codemirror/language"

interface DaadState {
  /** The quote character of the triple-quoted string we are inside, if any. */
  inTriple: string | null
}

/** Arabic keywords mapped to their CodeMirror token class. */
const KEYWORDS: Record<string, string> = {
  // if / elif / else
  "إذا": "keyword", "اذا": "keyword", "لو": "keyword",
  "وإذا": "keyword", "واذا": "keyword", "ولو": "keyword",
  "وإلا": "keyword", "والا": "keyword",
  // loops
  "طالما": "keyword", "مادام": "keyword",
  "لكل": "keyword", "في": "keyword",
  "كرر": "keyword", "مرات": "keyword",
  // imports
  "من": "keyword",
  "إستورد": "keyword", "استورد": "keyword",
  "كـ": "keyword", "ك": "keyword", "باسم": "keyword",
  // functions and flow control
  "أرجع": "keyword", "ارجع": "keyword",
  "دالة": "keyword",
  "أخرج": "keyword", "اخرج": "keyword",
  "تابع": "keyword",
  "صنف": "keyword",
  // booleans
  "صحيح": "atom", "خطأ": "atom", "خطا": "atom",
  // logical operators
  "و": "keyword", "أو": "keyword", "او": "keyword",
  "ليس": "keyword", "لا": "keyword",
}

// Arabic (0600–06FF) and Arabic Supplement (0750–077F).
const ARABIC_WORD = /[\u0600-\u06FF\u0750-\u077F]+/

export const daadStreamParser: StreamParser<DaadState> = {
  name: "daad",

  startState: () => ({ inTriple: null }),
  copyState: (state) => ({ inTriple: state.inTriple }),

  token(stream, state) {
    // Continuation of a triple-quoted string from a previous line.
    if (state.inTriple) {
      const quote = state.inTriple
      while (!stream.eol()) {
        if (stream.match(quote + quote + quote)) {
          state.inTriple = null
          break
        }
        stream.next()
      }
      return "string"
    }

    if (stream.eatSpace()) return null
    const ch = stream.peek()!

    if (ch === "#") {
      stream.skipToEnd()
      return "comment"
    }

    if (ch === '"' || ch === "'") {
      const quote = stream.next()!
      if (stream.match(quote + quote)) {
        state.inTriple = quote
        while (!stream.eol()) {
          if (stream.match(quote + quote + quote)) {
            state.inTriple = null
            break
          }
          stream.next()
        }
        return "string"
      }
      let escaped = false
      while (!stream.eol()) {
        const c = stream.next()
        if (escaped) escaped = false
        else if (c === "\\") escaped = true
        else if (c === quote) break
      }
      return "string"
    }

    if (
      stream.match(/^-?(?:0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/)
    ) {
      return "number"
    }

    if (ARABIC_WORD.test(ch)) {
      stream.match(ARABIC_WORD)
      const word = stream.current()
      return Object.prototype.hasOwnProperty.call(KEYWORDS, word)
        ? KEYWORDS[word]
        : "variable"
    }

    if (/[a-zA-Z_\u00C0-\u024F]/.test(ch)) {
      stream.match(/[a-zA-Z_\u00C0-\u024F\d]*/)
      return "variable"
    }

    if (stream.match(/^[+\-*/%&|^~<>=!]+/)) return "operator"
    if (stream.match(/^[()[\]{},;:.@]/)) return "punctuation"

    stream.next()
    return null
  },

  indent: () => null,

  languageData: {
    commentTokens: { line: "#" },
    closeBrackets: { brackets: ["(", "[", "{", '"', "'"] },
  },
}
