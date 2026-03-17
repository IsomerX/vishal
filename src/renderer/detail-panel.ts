import { VMState } from '../vm/types';
import { FLAG_Z, FLAG_C, FLAG_N, FLAG_V } from '../vm/types';
import { OPCODE_NAMES, INSTRUCTION_SIZE } from '../vm/opcodes';

// ---------------------------------------------------------------------------
// Register panel
// ---------------------------------------------------------------------------

/**
 * Render PC, SP, R0-R7 and FLAGS into `container`.
 * Each register is rendered as:
 *   <div class="reg-entry">
 *     <div class="reg-name">PC</div>
 *     <div class="reg-value">0x00FF</div>
 *   </div>
 */
export function updateRegisters(container: HTMLElement, state: VMState): void {
  const regs = state.registers;

  // Build the entries list: [name, formatted value]
  const entries: [string, string][] = [
    ['PC',    '0x' + regs.PC.toString(16).toUpperCase().padStart(4, '0')],
    ['SP',    '0x' + regs.SP.toString(16).toUpperCase().padStart(4, '0')],
    ['R0',    regs.R0.toString(16).toUpperCase().padStart(2, '0')],
    ['R1',    regs.R1.toString(16).toUpperCase().padStart(2, '0')],
    ['R2',    regs.R2.toString(16).toUpperCase().padStart(2, '0')],
    ['R3',    regs.R3.toString(16).toUpperCase().padStart(2, '0')],
    ['R4',    regs.R4.toString(16).toUpperCase().padStart(2, '0')],
    ['R5',    regs.R5.toString(16).toUpperCase().padStart(2, '0')],
    ['R6',    regs.R6.toString(16).toUpperCase().padStart(2, '0')],
    ['R7',    regs.R7.toString(16).toUpperCase().padStart(2, '0')],
    ['FLAGS', formatFlags(regs.FLAGS)],
  ];

  // Reconcile DOM nodes for performance (avoid full innerHTML thrash)
  const existing = container.querySelectorAll<HTMLElement>('.reg-entry');

  entries.forEach(([name, value], i) => {
    let entry = existing[i] as HTMLElement | undefined;
    if (!entry) {
      entry = document.createElement('div');
      entry.className = 'reg-entry';
      const nameEl  = document.createElement('div');
      nameEl.className = 'reg-name';
      const valueEl = document.createElement('div');
      valueEl.className = 'reg-value';
      entry.appendChild(nameEl);
      entry.appendChild(valueEl);
      container.appendChild(entry);
    }

    const nameEl  = entry.querySelector<HTMLElement>('.reg-name')!;
    const valueEl = entry.querySelector<HTMLElement>('.reg-value')!;

    if (nameEl.textContent  !== name)  nameEl.textContent  = name;
    if (valueEl.textContent !== value) valueEl.textContent = value;
  });

  // Remove excess nodes if memory shrank (shouldn't happen, but be safe)
  for (let i = entries.length; i < existing.length; i++) {
    existing[i].remove();
  }
}

/** Build a ZCNV string where set flags are uppercase, clear flags are '-'. */
function formatFlags(flags: number): string {
  return [
    flags & FLAG_Z ? 'Z' : '-',
    flags & FLAG_C ? 'C' : '-',
    flags & FLAG_N ? 'N' : '-',
    flags & FLAG_V ? 'V' : '-',
  ].join('');
}

// ---------------------------------------------------------------------------
// Current instruction panel
// ---------------------------------------------------------------------------

/**
 * Decode and display the instruction currently pointed to by PC.
 *
 * Halted:   shows the error message if present, otherwise "HALTED".
 * Running:  shows  "<MNEMONIC>  <raw hex bytes>"
 *           e.g.   "MOV  10 00 2A"
 * Unknown:  shows  "?? <opcode byte>"
 */
export function updateCurrentInstruction(container: HTMLElement, state: VMState): void {
  let text: string;

  if (state.halted) {
    text = state.error ? `ERROR: ${state.error}` : 'HALTED';
  } else {
    const pc     = state.registers.PC;
    const opcode = state.memory[pc];
    const mnemonic = OPCODE_NAMES[opcode];

    if (mnemonic === undefined) {
      text = `?? ${opcode.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      const size  = INSTRUCTION_SIZE[opcode] ?? 1;
      const bytes: string[] = [];
      for (let i = 0; i < size; i++) {
        const b = state.memory[pc + i];
        bytes.push(b !== undefined ? b.toString(16).toUpperCase().padStart(2, '0') : '??');
      }
      text = `${mnemonic}  ${bytes.join(' ')}`;
    }
  }

  if (container.textContent !== text) {
    container.textContent = text;
  }
}

// ---------------------------------------------------------------------------
// Stack view panel
// ---------------------------------------------------------------------------

/**
 * Show up to `maxEntries` stack entries (SP+1 upward toward the top of memory).
 *
 * Each entry is rendered as:
 *   <div class="stack-entry">
 *     <div class="stack-addr">0x00FF</div>
 *     <div class="stack-val">2A</div>
 *   </div>
 *
 * If the stack is empty a single text node "Empty" is shown.
 */
export function updateStackView(
  container: HTMLElement,
  state: VMState,
  maxEntries = 8,
): void {
  const sp         = state.registers.SP;
  const memSize    = state.memory.length;

  // Stack grows downward: SP points to the last-written byte.
  // Entries live at SP+1 .. memSize-1 (topmost = SP+1).
  const stackTop    = sp + 1;
  const stackBottom = memSize - 1;

  if (stackTop > stackBottom) {
    const emptyClass = 'stack-empty';
    const existingEmpty = container.querySelector<HTMLElement>(`.${emptyClass}`);
    const existingEntries = container.querySelectorAll<HTMLElement>('.stack-entry');

    existingEntries.forEach(entry => entry.remove());

    if (!existingEmpty) {
      container.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = emptyClass;
      empty.textContent = 'Empty';
      container.appendChild(empty);
    }
    return;
  }

  // Collect addresses from top downward, limited to maxEntries
  const addrs: number[] = [];
  for (let addr = stackTop; addr <= stackBottom && addrs.length < maxEntries; addr++) {
    addrs.push(addr);
  }

  // Reconcile DOM nodes
  const existing = container.querySelectorAll<HTMLElement>('.stack-entry');

  container.querySelector('.stack-empty')?.remove();

  addrs.forEach((addr, i) => {
    let entry = existing[i] as HTMLElement | undefined;
    if (!entry) {
      entry = document.createElement('div');
      entry.className = 'stack-entry';
      const addrEl = document.createElement('div');
      addrEl.className = 'stack-addr';
      const valEl  = document.createElement('div');
      valEl.className = 'stack-val';
      entry.appendChild(addrEl);
      entry.appendChild(valEl);
      container.appendChild(entry);
    }

    const addrEl = entry.querySelector<HTMLElement>('.stack-addr')!;
    const valEl  = entry.querySelector<HTMLElement>('.stack-val')!;

    const addrText = '0x' + addr.toString(16).toUpperCase().padStart(4, '0');
    const valText  = state.memory[addr].toString(16).toUpperCase().padStart(2, '0');

    if (addrEl.textContent !== addrText) addrEl.textContent = addrText;
    if (valEl.textContent  !== valText)  valEl.textContent  = valText;
  });

  // Remove excess entries
  for (let i = addrs.length; i < existing.length; i++) {
    existing[i].remove();
  }
}
