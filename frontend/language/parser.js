/**
 * parser.js — Daad (ض) stream parser
 *
 * Uses CodeMirror's StreamLanguage (a tokenizer-based approach) instead of
 * the Lezer LR parser. This is the right choice here because:
 *
 *  - The Lezer Python parser produces AST *node type names* (IfStatement,
 *    FunctionDefinition, …) which are structural — they never contain the
 *    Arabic keyword text itself, so styleTags() can't match them.
 *  - A stream parser tokenizes character-by-character and can return any
 *    token class you like for any matched text, so Arabic keywords highlight
 *    correctly out of the box.
 */

// ── keyword sets ────────────────────────────────────────────────────────────

/** All Arabic keywords mapped to their CodeMirror token type. */
const KEYWORDS = {
  // control flow — if
  'إذا': 'keyword',
  'اذا': 'keyword',
  'لو':  'keyword',

  // control flow — elif
  'وإذا': 'keyword',
  'واذا': 'keyword',
  'ولو':  'keyword',

  // control flow — else
  'وإلا': 'keyword',
  'والا': 'keyword',

  // control flow — while
  'طالما': 'keyword',
  'مادام': 'keyword',

  // control flow — for / in
  'لكل': 'keyword',
  'في':  'keyword',

  // control flow — repeat / times
  'كرر':  'keyword',
  'مرات': 'keyword',
  // from 
  'من': 'keyword',
  
  // import
  'إستورد': 'keyword',
  'استورد': 'keyword',

  // as (import alias)
  'كـ':   'keyword',
  'ك':    'keyword',
  'باسم': 'keyword',

  // return
  'أرجع': 'keyword',
  'ارجع': 'keyword',

  // function definition
  'دالة': 'keyword',

  // break
  'أخرج': 'keyword',
  'اخرج': 'keyword',

  // continue
  'تابع': 'keyword',

  // boolean literals
  'صحيح': 'atom',
  'خطأ':  'atom',
  'خطا':  'atom',

  // logical operators
  'و':    'keyword',
  'أو':   'keyword',
  'او':   'keyword',

  // not
  'ليس': 'keyword',
  'لا':  'keyword',
};

// A single regex that matches any Arabic / extended-Arabic Unicode word.
// Unicode block 0600-06FF covers Arabic; 0750-077F covers Arabic Supplement.
const ARABIC_WORD = /[\u0600-\u06FF\u0750-\u077F]+/;

// ── stream parser definition ────────────────────────────────────────────────

export const daadStreamParser = {
  name: 'daad',

  /**
   * token(stream, state) — called for every character position.
   * Return a CSS token class string, or null to consume one char as default.
   */
  token(stream, state) {
    // ── skip leading whitespace ──────────────────────────────────────────
    if (stream.eatSpace()) return null;

    const ch = stream.peek();

    // ── line comment (#) ────────────────────────────────────────────────
    if (ch === '#') {
      stream.skipToEnd();
      return 'comment';
    }

    // ── string literals (" or ') ─────────────────────────────────────────
    if (ch === '"' || ch === "'") {
      const quote = stream.next();            // consume opening quote
      const triple = stream.match(quote + quote); // check for """ / '''
      if (triple) {
        // triple-quoted string — scan until matching triple quote
        state.inTriple = quote;
      } else {
        // single-quoted string
        let escaped = false;
        while (!stream.eol()) {
          const c = stream.next();
          if (escaped) { escaped = false; continue; }
          if (c === '\\') { escaped = true; continue; }
          if (c === quote) break;
        }
        return 'string';
      }
    }

    // continuing inside a triple-quoted string
    if (state.inTriple) {
      const q = state.inTriple;
      while (!stream.eol()) {
        if (stream.match(q + q + q)) {
          state.inTriple = null;
          break;
        }
        stream.next();
      }
      return 'string';
    }

    // ── numeric literals ─────────────────────────────────────────────────
    if (stream.match(/^-?(?:0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/)) {
      return 'number';
    }

    // ── Arabic keywords / identifiers ────────────────────────────────────
    if (ARABIC_WORD.test(ch)) {
      stream.match(ARABIC_WORD);
      const word = stream.current();
      if (Object.prototype.hasOwnProperty.call(KEYWORDS, word)) {
        return KEYWORDS[word];
      }
      return 'variable';
    }

    // ── ASCII identifiers (built-ins, mixed code, etc.) ──────────────────
    if (/[a-zA-Z_\u00C0-\u024F]/.test(ch)) {
      stream.match(/[a-zA-Z_\u00C0-\u024F\d]*/);
      return 'variable';
    }

    // ── operators & punctuation ──────────────────────────────────────────
    if (stream.match(/^[+\-*/%&|^~<>=!]+/)) return 'operator';
    if (stream.match(/^[()[\]{},;:.@]/))    return 'punctuation';

    // ── anything else — consume one character and let CM style it ────────
    stream.next();
    return null;
  },

  /** Initial state for each new line. */
  startState() {
    return { inTriple: null };
  },

  /** Carry multi-line state (triple-quoted strings) across lines. */
  copyState(state) {
    return { inTriple: state.inTriple };
  },

  /**
   * blankLine — called when CodeMirror encounters a blank line.
   * For Python-like indentation we leave state unchanged.
   */
  blankLine(state) {},

  /** Indentation helper — rely on CodeMirror's default behaviour. */
  indent(state, textAfter) {
    return null; // use editor default
  },

  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
  },
};