import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"

/**
 * Keyword table. Alternative spellings (without hamza, etc.) stay searchable
 * but `apply` inserts the canonical form; canonical spellings rank higher.
 */
export const daadKeywords: Completion[] = [
  // if / elif / else
  { label: "إذا", type: "keyword", info: "if", boost: 1 },
  { label: "اذا", type: "keyword", info: "if", apply: "إذا" },
  { label: "لو", type: "keyword", info: "if" },
  { label: "وإذا", type: "keyword", info: "elif", boost: 1 },
  { label: "واذا", type: "keyword", info: "elif", apply: "وإذا" },
  { label: "ولو", type: "keyword", info: "elif" },
  { label: "وإلا", type: "keyword", info: "else", boost: 1 },
  { label: "والا", type: "keyword", info: "else", apply: "وإلا" },

  // loops
  { label: "طالما", type: "keyword", info: "while" },
  { label: "مادام", type: "keyword", info: "while" },
  { label: "لكل", type: "keyword", info: "for" },
  { label: "في", type: "keyword", info: "in" },
  { label: "كرر", type: "keyword", info: "repeat" },
  { label: "مرات", type: "keyword", info: "times" },

  // imports
  { label: "من", type: "keyword", info: "from" },
  { label: "إستورد", type: "keyword", info: "import", boost: 1 },
  { label: "استورد", type: "keyword", info: "import", apply: "إستورد" },
  { label: "كـ", type: "keyword", info: "as", boost: 1 },
  { label: "ك", type: "keyword", info: "as", apply: "كـ" },
  { label: "باسم", type: "keyword", info: "as" },

  // functions and flow control
  { label: "دالة", type: "keyword", info: "function" },
  { label: "أرجع", type: "keyword", info: "return", boost: 1 },
  { label: "ارجع", type: "keyword", info: "return", apply: "أرجع" },
  { label: "أخرج", type: "keyword", info: "break", boost: 1 },
  { label: "اخرج", type: "keyword", info: "break", apply: "أخرج" },
  { label: "تابع", type: "keyword", info: "continue" },

  // booleans and logic
  { label: "صحيح", type: "keyword", info: "True" },
  { label: "خطأ", type: "keyword", info: "False" },
  { label: "خطا", type: "keyword", info: "False", apply: "خطأ" },
  { label: "و", type: "keyword", info: "and" },
  { label: "أو", type: "keyword", info: "or", boost: 1 },
  { label: "او", type: "keyword", info: "or", apply: "أو" },
  { label: "ليس", type: "keyword", info: "not" },
  { label: "لا", type: "keyword", info: "not" },
]

const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F]+/

/** Offers keyword completions while the user is typing an Arabic word. */
export function daadCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(ARABIC_RUN)
  if (!word) return null
  if (word.from === word.to && !context.explicit) return null

  return {
    from: word.from,
    options: daadKeywords,
    validFor: /^[\u0600-\u06FF\u0750-\u077F]*$/,
  }
}
