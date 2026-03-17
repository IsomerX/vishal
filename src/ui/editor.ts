import { AssemblerError, AssemblerResult } from '../assembler/types';
import { assemble } from '../assembler/parser';
import { compileTinyC } from '../compiler/tiny-c';
import { BUBBLE_SORT_SOURCE } from '../examples/bubble-sort';
import { COUNTER_SOURCE } from '../examples/counter';
import { FIBONACCI_SOURCE } from '../examples/fibonacci';
import { GAME_OF_LIFE_SOURCE } from '../examples/game-of-life';
import { PIXEL_TEST_SOURCE } from '../examples/pixel-test';
import { TINY_C_COUNTER_SOURCE } from '../examples/tiny-c-counter';

export type SourceLanguage = 'assembly' | 'tiny-c';

interface ExampleDefinition {
  source: string;
  language: SourceLanguage;
}

interface BuildSourceResult {
  result: AssemblerResult | null;
  errors: AssemblerError[];
  compiledAssembly?: string;
}

const EXAMPLES: Record<string, ExampleDefinition> = {
  'bubble-sort': { source: BUBBLE_SORT_SOURCE, language: 'assembly' },
  'counter': { source: COUNTER_SOURCE, language: 'assembly' },
  'fibonacci': { source: FIBONACCI_SOURCE, language: 'assembly' },
  'game-of-life': { source: GAME_OF_LIFE_SOURCE, language: 'assembly' },
  'pixel-test': { source: PIXEL_TEST_SOURCE, language: 'assembly' },
  'tiny-c-counter': { source: TINY_C_COUNTER_SOURCE, language: 'tiny-c' },
};

export function buildSource(source: string, language: SourceLanguage): BuildSourceResult {
  if (language === 'tiny-c') {
    const compiled = compileTinyC(source);
    if (compiled.errors.length > 0) {
      return { result: null, errors: compiled.errors };
    }

    const result = assemble(compiled.assembly);
    return {
      result,
      errors: result.errors,
      compiledAssembly: compiled.assembly,
    };
  }

  const result = assemble(source);
  return { result, errors: result.errors };
}

function updateBuildButtonLabel(button: HTMLButtonElement, language: SourceLanguage): void {
  button.textContent = language === 'tiny-c' ? 'Compile & Load' : 'Assemble & Load';
}

export function setupEditor(
  editorEl: HTMLTextAreaElement,
  dropdownEl: HTMLSelectElement,
  languageEl: HTMLSelectElement,
  assembleBtn: HTMLButtonElement,
  errorsEl: HTMLElement,
  onAssemble: (result: AssemblerResult) => void,
): void {
  updateBuildButtonLabel(assembleBtn, languageEl.value as SourceLanguage);

  // Dropdown change: load example source into editor
  dropdownEl.addEventListener('change', () => {
    const key = dropdownEl.value;
    if (key && EXAMPLES[key]) {
      editorEl.value = EXAMPLES[key].source;
      languageEl.value = EXAMPLES[key].language;
      updateBuildButtonLabel(assembleBtn, EXAMPLES[key].language);
      errorsEl.textContent = '';
      errorsEl.hidden = true;
    }
  });

  languageEl.addEventListener('change', () => {
    updateBuildButtonLabel(assembleBtn, languageEl.value as SourceLanguage);
  });

  // Assemble button: call assemble(), show errors or call onAssemble callback
  assembleBtn.addEventListener('click', () => {
    const source = editorEl.value;
    const build = buildSource(source, languageEl.value as SourceLanguage);

    if (build.errors.length > 0 || !build.result) {
      errorsEl.textContent = build.errors
        .map(e => `Line ${e.line}: ${e.message}`)
        .join('\n');
      errorsEl.hidden = false;
    } else {
      errorsEl.textContent = '';
      errorsEl.hidden = true;
      onAssemble(build.result);
    }
  });
}
