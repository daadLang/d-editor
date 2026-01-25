import { CompletionContext } from '@codemirror/autocomplete';

// ض language keywords
export const daadKeywords = [
  { label: 'اذا', type: 'keyword', info: 'if statement',apply: 'إذا' },
  { label: 'إذا', type: 'keyword', info: 'if statement' },

  { label: 'لو', type: 'keyword', info: 'if statement' },

  { label: 'واذا', type: 'keyword', info: 'elif statement',apply: 'وإذا' },
  { label: 'وإذا', type: 'keyword', info: 'elif statement' },

  { label: 'ولو', type: 'keyword', info: 'elif statement' },

  { label: 'وإلا', type: 'keyword', info: 'else statement' },
  { label: 'والا', type: 'keyword', info: 'else statement',apply: 'وإلا' },

  { label: 'طالما', type: 'keyword', info: 'while loop' },
  { label: 'مادام', type: 'keyword', info: 'while loop' },
  { label: 'لكل', type: 'keyword', info: 'for loop' },
  { label: 'في', type: 'keyword', info: 'in operator' },
  { label: 'كرر', type: 'keyword', info: 'repeat' },
  { label: 'مرات', type: 'keyword', info: 'times' },

  { label: 'إستورد', type: 'keyword', info: 'import' },
  { label: 'استورد', type: 'keyword', info: 'import',apply: 'إستورد' },

  { label: 'كـ', type: 'keyword', info: 'as (import alias)' },
  { label: 'ك', type: 'keyword', info: 'as (import alias)',apply: 'كـ' },

  { label: 'باسم', type: 'keyword', info: 'as (import alias)' },
  
  { label: 'أرجع', type: 'keyword', info: 'return' },
  { label: 'ارجع', type: 'keyword', info: 'return',apply: 'أرجع' },
  
  { label: 'دالة', type: 'keyword', info: 'function definition' },

  { label: 'أخرج', type: 'keyword', info: 'break' },
  { label: 'اخرج', type: 'keyword', info: 'break',apply: 'أخرج' },

  { label: 'تابع', type: 'keyword', info: 'continue' },
  { label: 'صحيح', type: 'keyword', info: 'True' },

  { label: 'خطأ', type: 'keyword', info: 'False',apply: 'خطأ' },
  { label: 'خطأ', type: 'keyword', info: 'False'},

  { label: 'و', type: 'keyword', info: 'and operator' },

  { label: 'أو', type: 'keyword', info: 'or operator' },
  { label: 'او', type: 'keyword', info: 'or operator',apply: 'أو' },

  { label: 'ليس', type: 'keyword', info: 'not operator' },
  { label: 'لا', type: 'keyword', info: 'not operator' }
];

export function daadCompletions(context) {
  let word = context.matchBefore(/[\u0600-\u06FF]+/);
  
  if (!word) return null;
  
  if (word.from == word.to && !context.explicit) {
    return null;
  }
  
  return {
    from: word.from,
    options: daadKeywords,
    validFor: /^[\u0600-\u06FF]*$/
  };
}
