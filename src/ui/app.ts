import { VMState } from '../vm/types';
import { createVM } from '../vm/vm';
import { TimeTravel } from '../vm/time-travel';
import { HexGridRenderer } from '../renderer/hex-grid';
import { updateRegisters, updateCurrentInstruction, updateStackView } from '../renderer/detail-panel';
import { updateNarration, updateMemoryStats, computeMemoryStats } from '../renderer/narration';
import { AssemblerResult } from '../assembler/types';
import { assemble } from '../assembler/parser';
import { createController, VMController } from './controls';
import { setupEditor } from './editor';
import { BUBBLE_SORT_SOURCE } from '../examples/bubble-sort';

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function init(): void {
  // 1. Get all DOM elements by ID
  const canvas = getEl<HTMLCanvasElement>('hex-grid');
  const registersEl = getEl<HTMLDivElement>('registers');
  const instructionEl = getEl<HTMLDivElement>('current-instruction');
  const stackEl = getEl<HTMLDivElement>('stack-view');
  const cycleCountEl = getEl<HTMLSpanElement>('cycle-count');
  const errorSection = getEl<HTMLElement>('error-section');
  const errorMessage = getEl<HTMLDivElement>('error-message');
  const narrationEl = getEl<HTMLDivElement>('narration');
  const memoryStatsEl = getEl<HTMLDivElement>('memory-stats');

  const btnStep = getEl<HTMLButtonElement>('btn-step');
  const btnStepBack = getEl<HTMLButtonElement>('btn-step-back');
  const btnRun = getEl<HTMLButtonElement>('btn-run');
  const btnReset = getEl<HTMLButtonElement>('btn-reset');

  const speedSlider = getEl<HTMLInputElement>('speed-slider');
  const speedDisplay = getEl<HTMLSpanElement>('speed-display');
  const memorySizeSelect = getEl<HTMLSelectElement>('memory-size');

  const editorEl = getEl<HTMLTextAreaElement>('code-editor');
  const examplesDropdown = getEl<HTMLSelectElement>('examples-dropdown');
  const assembleBtn = getEl<HTMLButtonElement>('btn-assemble');
  const assemblerErrors = getEl<HTMLDivElement>('assembler-errors');

  // 2. Create VM, TimeTravel, HexGridRenderer, VMController
  let memorySize = parseInt(memorySizeSelect.value, 10) || 4096;
  let vm = createVM(memorySize);
  let timeTravel = new TimeTravel();
  const hexGrid = new HexGridRenderer(canvas);
  let controller: VMController = createController(vm, timeTravel);

  // Track current metadata for hex grid coloring
  let currentMetadata: AssemblerResult['metadata'] | null = null;

  // 3. Set up render callback on state change
  function renderState(state: VMState): void {
    hexGrid.render(state);
    updateRegisters(registersEl, state);
    updateCurrentInstruction(instructionEl, state);
    updateStackView(stackEl, state);
    cycleCountEl.textContent = state.cycle.toString();

    // Narration — human-readable description of next instruction
    updateNarration(narrationEl, state);

    // Memory stats
    const codeEnd = currentMetadata ? currentMetadata.codeEnd : -1;
    updateMemoryStats(memoryStatsEl, computeMemoryStats(state, codeEnd));

    // Error display
    if (state.error) {
      errorMessage.textContent = state.error;
      errorSection.hidden = false;
    } else {
      errorMessage.textContent = '';
      errorSection.hidden = true;
    }

    // Run/Pause button text
    btnRun.textContent = controller.isRunning() ? 'Pause' : 'Run';
  }

  controller.onStateChange(renderState);

  // 4. Wire button click handlers
  btnStep.addEventListener('click', () => {
    controller.step();
  });

  btnStepBack.addEventListener('click', () => {
    controller.stepBack();
  });

  btnRun.addEventListener('click', () => {
    if (controller.isRunning()) {
      controller.pause();
    } else {
      controller.run();
    }
  });

  btnReset.addEventListener('click', () => {
    controller.reset();
    vm = createVM(memorySize);
    // Reload bytecode if we have metadata
    if (currentMetadata) {
      const source = editorEl.value;
      const result = assemble(source);
      if (result.errors.length === 0) {
        loadBytecode(vm, result);
      }
    }
    controller.setState(vm);
  });

  // 5. Wire speed slider (map 0-100 to 1-10000 via Math.pow(10, val/25))
  function updateSpeed(): void {
    const val = parseInt(speedSlider.value, 10);
    const ips = Math.round(Math.pow(10, val / 25));
    controller.setSpeed(ips);
    speedDisplay.textContent = ips >= 1000 ? `${(ips / 1000).toFixed(1)}k/s` : `${ips}/s`;
  }
  speedSlider.addEventListener('input', updateSpeed);
  updateSpeed();

  // 6. Wire memory size selector
  memorySizeSelect.addEventListener('change', () => {
    controller.pause();
    controller.reset();
    memorySize = parseInt(memorySizeSelect.value, 10) || 4096;
    vm = createVM(memorySize);
    timeTravel = new TimeTravel();
    controller = createController(vm, timeTravel);
    controller.onStateChange(renderState);
    currentMetadata = null;
    hexGrid.setMetadata(null);
    updateSpeed();
    renderState(vm);
  });

  // Helper to load bytecode into VM state
  function loadBytecode(state: VMState, result: AssemblerResult): void {
    state.memory.set(result.bytecode);
    currentMetadata = result.metadata;
    hexGrid.setMetadata(result.metadata);
  }

  // 7. Set up editor with onAssemble callback
  setupEditor(editorEl, examplesDropdown, assembleBtn, assemblerErrors, (result: AssemblerResult) => {
    controller.pause();
    controller.reset();
    vm = createVM(memorySize);
    timeTravel = new TimeTravel();
    controller = createController(vm, timeTravel);
    controller.onStateChange(renderState);
    loadBytecode(vm, result);
    controller.setState(vm);
  });

  // 8. Load default bubble sort example into editor
  editorEl.value = BUBBLE_SORT_SOURCE;
  examplesDropdown.value = 'bubble-sort';

  // Assemble and load the default program
  const defaultResult = assemble(BUBBLE_SORT_SOURCE);
  if (defaultResult.errors.length === 0) {
    loadBytecode(vm, defaultResult);
    controller.setState(vm);
  }

  // 9. Initial render
  renderState(vm);

  // 10. Handle window resize
  window.addEventListener('resize', () => {
    renderState(controller.getState());
  });
}

// Boot
init();
