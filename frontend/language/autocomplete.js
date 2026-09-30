/**
 * autocomplete.js — Daad (ض) keyword completions
 *
 * Changes from the original:
 *  - Removed duplicate `خطأ` entries.
 *  - Each "common misspelling" variant uses `apply` to insert the canonical
 *    form, keeping the list clean while still matching as the user types.
 *  - Added `boost` values so canonical spellings rank above aliases.
 *  - Exported `daadCompletions` as a plain CompletionSource function that
 *    works with the `autocompletion({ override: [...] })` API.
 */

// ── keyword table ────────────────────────────────────────────────────────────

export const daadKeywords = [
  // ── if ──────────────────────────────────────────────────────────────────
  { label: 'إذا',  type: 'keyword', info: 'if statement', boost: 1 },
  { label: 'اذا',  type: 'keyword', info: 'if statement', apply: 'إذا' },
  { label: 'لو',   type: 'keyword', info: 'if statement' },

  // ── elif ─────────────────────────────────────────────────────────────────
  { label: 'وإذا', type: 'keyword', info: 'elif statement', boost: 1 },
  { label: 'واذا', type: 'keyword', info: 'elif statement', apply: 'وإذا' },
  { label: 'ولو',  type: 'keyword', info: 'elif statement' },

  // ── else ─────────────────────────────────────────────────────────────────
  { label: 'وإلا', type: 'keyword', info: 'else statement', boost: 1 },
  { label: 'والا', type: 'keyword', info: 'else statement', apply: 'وإلا' },

  // ── while ────────────────────────────────────────────────────────────────
  { label: 'طالما', type: 'keyword', info: 'while loop' },
  { label: 'مادام', type: 'keyword', info: 'while loop' },

  // ── for / in ─────────────────────────────────────────────────────────────
  { label: 'لكل', type: 'keyword', info: 'for loop' },
  { label: 'في',  type: 'keyword', info: 'in operator' },

  // ── repeat ───────────────────────────────────────────────────────────────
  { label: 'كرر',  type: 'keyword', info: 'repeat' },
  { label: 'مرات', type: 'keyword', info: 'times' },

  // ── import ───────────────────────────────────────────────────────────────
  { label: 'إستورد', type: 'keyword', info: 'import', boost: 1 },
  { label: 'استورد', type: 'keyword', info: 'import', apply: 'إستورد' },

  // ── as ───────────────────────────────────────────────────────────────────
  { label: 'كـ',   type: 'keyword', info: 'as (import alias)', boost: 1 },
  { label: 'ك',    type: 'keyword', info: 'as (import alias)', apply: 'كـ' },
  { label: 'باسم', type: 'keyword', info: 'as (import alias)' },

  // ── return ───────────────────────────────────────────────────────────────
  { label: 'أرجع', type: 'keyword', info: 'return', boost: 1 },
  { label: 'ارجع', type: 'keyword', info: 'return', apply: 'أرجع' },

  // ── function definition ──────────────────────────────────────────────────
  { label: 'دالة', type: 'keyword', info: 'function definition' },

  // ── break ────────────────────────────────────────────────────────────────
  { label: 'أخرج', type: 'keyword', info: 'break', boost: 1 },
  { label: 'اخرج', type: 'keyword', info: 'break', apply: 'أخرج' },

  // ── continue ─────────────────────────────────────────────────────────────
  { label: 'تابع', type: 'keyword', info: 'continue' },

  // ── booleans ─────────────────────────────────────────────────────────────
  { label: 'صحيح', type: 'keyword', info: 'True' },
  { label: 'خطأ',  type: 'keyword', info: 'False' },
  { label: 'خطا',  type: 'keyword', info: 'False', apply: 'خطأ' },

  // ── logical operators ────────────────────────────────────────────────────
  { label: 'و',    type: 'keyword', info: 'and operator' },
  { label: 'أو',   type: 'keyword', info: 'or operator', boost: 1 },
  { label: 'او',   type: 'keyword', info: 'or operator', apply: 'أو' },

  // ── not ──────────────────────────────────────────────────────────────────
  { label: 'ليس', type: 'keyword', info: 'not operator' },
  { label: 'لا',  type: 'keyword', info: 'not operator' },
];

// ── completion source ────────────────────────────────────────────────────────

/**
 * daadCompletions(context) — CompletionSource for Daad keywords.
 *
 * Matches any sequence of Arabic Unicode characters before the cursor
 * and offers all keywords whose label starts with what was typed.
 */
export function daadCompletions(context) {
  // Match a run of Arabic characters ending at the cursor
  const word = context.matchBefore(/[\u0600-\u06FF\u0750-\u077F]+/);

  // If no Arabic word prefix is found and the completion wasn't explicitly
  // triggered (Ctrl+Space), don't open the popup.
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  return {
    from: word.from,
    options: daadKeywords,
    // Only keep the popup open while the user is typing Arabic
    validFor: /^[\u0600-\u06FF\u0750-\u077F]*$/,
  };
}