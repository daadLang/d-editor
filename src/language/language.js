import { parser } from './parser.js';
import {
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  foldNodeProp,
  foldInside,
  delimitedIndent
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';

// Define the ض language
export const daadLanguage = LRLanguage.define({
  name: 'daad',
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        IfStatement: delimitedIndent({ closing: ')', align: false }),
        WhileStatement: delimitedIndent({ closing: ')', align: false }),
        ForStatement: delimitedIndent({ closing: ')', align: false }),
        FunctionDef: delimitedIndent({ closing: ')', align: false })
      }),
      foldNodeProp.add({
        'IfStatement WhileStatement ForStatement FunctionDef': foldInside
      }),
      styleTags({
        // Control flow - accept both correct and common spellings
        'اذا إذا لو واذا وإذا ولو والا وإلا': t.controlKeyword,
        'طالما مادام': t.controlKeyword,
        'لكل في': t.controlKeyword,
        'كرر مرات': t.controlKeyword,
        'استورد إستورد كـ ك باسم': t.moduleKeyword,
        'ارجع أرجع': t.controlKeyword,
        'دالة': t.definitionKeyword,
        'اخرج أخرج تابع': t.controlKeyword,
        'صحيح خطا خطأ': t.bool,
        'و او أو': t.logicOperator,
        'ليس لا': t.operatorKeyword,
        'String': t.string,
        'Number': t.number,
        'Comment': t.lineComment,
        'Identifier': t.variableName,
        'FunctionName': t.function(t.variableName),
        '( )': t.paren,
        '[ ]': t.squareBracket,
        '{ }': t.brace,
        ',': t.separator,
        ':': t.punctuation
      })
    ]
  }),
  languageData: {
    commentTokens: { line: '#' },
    indentOnInput: /^\s*[\}\]\)]$/,
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] }
  }
});

export function daad() {
  return new LanguageSupport(daadLanguage);
}