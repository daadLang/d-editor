import { autocompletion } from "@codemirror/autocomplete"
import { LanguageSupport, StreamLanguage } from "@codemirror/language"

import { daadCompletions } from "./autocomplete"
import { daadStreamParser } from "./parser"

export const daadLanguage = StreamLanguage.define(daadStreamParser)

/** ض language support: tokenizer, highlighting and keyword completion. */
export function daad() {
  return new LanguageSupport(daadLanguage, [
    autocompletion({ override: [daadCompletions] }),
  ])
}
