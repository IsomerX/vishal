import { AssemblerResult } from '../assembler/types';
import { assemble } from '../assembler/parser';
import { BUBBLE_SORT_SOURCE } from '../examples/bubble-sort';
import { COUNTER_SOURCE } from '../examples/counter';
import { FIBONACCI_SOURCE } from '../examples/fibonacci';

const EXAMPLES: Record<string, string> = {
  'bubble-sort': BUBBLE_SORT_SOURCE,
  'counter': COUNTER_SOURCE,
  'fibonacci': FIBONACCI_SOURCE,
};

export function setupEditor(
  editorEl: HTMLTextAreaElement,
  dropdownEl: HTMLSelectElement,
  assembleBtn: HTMLButtonElement,
  errorsEl: HTMLElement,
  onAssemble: (result: AssemblerResult) => void,
): void {
  // Dropdown change: load example source into editor
  dropdownEl.addEventListener('change', () => {
    const key = dropdownEl.value;
    if (key && EXAMPLES[key]) {
      editorEl.value = EXAMPLES[key];
      errorsEl.textContent = '';
      errorsEl.hidden = true;
    }
  });

  // Assemble button: call assemble(), show errors or call onAssemble callback
  assembleBtn.addEventListener('click', () => {
    const source = editorEl.value;
    const result = assemble(source);

    if (result.errors.length > 0) {
      errorsEl.textContent = result.errors
        .map(e => `Line ${e.line}: ${e.message}`)
        .join('\n');
      errorsEl.hidden = false;
    } else {
      errorsEl.textContent = '';
      errorsEl.hidden = true;
      onAssemble(result);
    }
  });
}
