import { inject } from '@vercel/analytics';
import { VMState } from '../vm/types';
import { createVM } from '../vm/vm';
import { TimeTravel } from '../vm/time-travel';
import { HexGridRenderer } from '../renderer/hex-grid';
import { CpuSpaceScene } from '../renderer/cpu-space-scene';
import { updateRegisters, updateCurrentInstruction, updateStackView } from '../renderer/detail-panel';
import { updateNarration, updateMemoryStats, computeMemoryStats } from '../renderer/narration';
import { PixelDisplay } from '../renderer/pixel-display';
import { AssemblerResult } from '../assembler/types';
import { createController, VMController } from './controls';
import { buildSource, setupEditor, SourceLanguage } from './editor';
import { BUBBLE_SORT_SOURCE } from '../examples/bubble-sort';
import { OP_VSTORE, OP_VLOAD, OP_VCOPY } from '../vm/opcodes';

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function init(): void {
  // 1. Get all DOM elements by ID
  const sceneContainer = getEl<HTMLDivElement>('scene-container');
  const sceneCanvas = getEl<HTMLCanvasElement>('cpu-scene');
  const sceneStageEl = getEl<HTMLDivElement>('scene-stage');
  const sceneDetailEl = getEl<HTMLDivElement>('scene-detail');
  const sceneTelemetryEl = getEl<HTMLDivElement>('scene-telemetry');
  const gridContainer = getEl<HTMLDivElement>('grid-container');
  const canvas = getEl<HTMLCanvasElement>('hex-grid');
  const registersEl = getEl<HTMLDivElement>('registers');
  const instructionEl = getEl<HTMLDivElement>('current-instruction');
  const stackEl = getEl<HTMLDivElement>('stack-view');
  const cycleCountEl = getEl<HTMLSpanElement>('cycle-count');
  const errorSection = getEl<HTMLElement>('error-section');
  const errorMessage = getEl<HTMLDivElement>('error-message');
  const narrationEl = getEl<HTMLDivElement>('narration');
  const memoryStatsEl = getEl<HTMLDivElement>('memory-stats');
  const displayStatsEl = getEl<HTMLDivElement>('display-stats');
  const pixelCanvas = getEl<HTMLCanvasElement>('pixel-display');

  const btnStep = getEl<HTMLButtonElement>('btn-step');
  const btnStepBack = getEl<HTMLButtonElement>('btn-step-back');
  const btnRun = getEl<HTMLButtonElement>('btn-run');
  const btnReset = getEl<HTMLButtonElement>('btn-reset');

  const speedSlider = getEl<HTMLInputElement>('speed-slider');
  const speedDisplay = getEl<HTMLSpanElement>('speed-display');
  const memorySizeSelect = getEl<HTMLSelectElement>('memory-size');

  const editorEl = getEl<HTMLTextAreaElement>('code-editor');
  const examplesDropdown = getEl<HTMLSelectElement>('examples-dropdown');
  const languageSelect = getEl<HTMLSelectElement>('source-language');
  const assembleBtn = getEl<HTMLButtonElement>('btn-assemble');
  const assemblerErrors = getEl<HTMLDivElement>('assembler-errors');
  const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.view-toggle'));

  // 2. Create VM, TimeTravel, HexGridRenderer, VMController
  let memorySize = parseInt(memorySizeSelect.value, 10) || 4096;
  let vm = createVM(memorySize);
  let timeTravel = new TimeTravel();
  const hexGrid = new HexGridRenderer(canvas);
  const cpuScene = new CpuSpaceScene(sceneContainer, sceneCanvas, sceneStageEl, sceneDetailEl);
  const pixelDisplay = new PixelDisplay(pixelCanvas);
  let controller: VMController = createController(vm, timeTravel);
  let vramDirty = false;
  let currentWorkspaceView: 'scene' | 'memory' = 'scene';

  // Track current metadata for hex grid coloring
  let currentMetadata: AssemblerResult['metadata'] | null = null;
  const VramOpcodes = new Set([OP_VSTORE, OP_VLOAD, OP_VCOPY]);
  const RECOMMENDED_SPEEDS: Record<string, string> = {
    '': '50',
    'bubble-sort': '50',
    'counter': '50',
    'fibonacci': '50',
    'game-of-life': '90',
    'pixel-test': '80',
    'tiny-c-counter': '50',
  };

  function updateDisplayStats(state: VMState): void {
    if (!vramDirty) {
      displayStatsEl.innerHTML =
        `<div class="stat-row"><span class="stat-label">Status</span><span class="stat-value">Inactive</span></div>` +
        `<div class="stat-row"><span class="stat-label">Format</span><span class="stat-value">RGB332</span></div>`;
      return;
    }

    let activePixels = 0;
    for (let i = 0; i < state.vram.length; i++) {
      if (state.vram[i] !== 0) activePixels++;
    }

    displayStatsEl.innerHTML =
      `<div class="stat-row"><span class="stat-label">Status</span><span class="stat-value">Visible</span></div>` +
      `<div class="stat-row"><span class="stat-label">Active pixels</span><span class="stat-value">${activePixels} / ${state.vram.length}</span></div>` +
      `<div class="stat-row"><span class="stat-label">Format</span><span class="stat-value">RGB332</span></div>`;
  }

  function resetDisplayState(): void {
    vramDirty = false;
    pixelCanvas.classList.remove('visible');
  }

  function setWorkspaceView(view: 'scene' | 'memory'): void {
    currentWorkspaceView = view;
    sceneContainer.classList.toggle('is-active', view === 'scene');
    gridContainer.classList.toggle('is-active', view === 'memory');
    viewButtons.forEach(button => {
      button.classList.toggle('is-active', button.dataset.view === view);
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    cpuScene.setActive(view === 'scene');
    cpuScene.resize();
    if (view === 'memory') {
      hexGrid.render(controller.getState());
    }
  }

  // 3. Set up render callback on state change
  function renderState(state: VMState): void {
    if (currentWorkspaceView === 'memory') {
      hexGrid.render(state);
    }
    cpuScene.setState(state);
    sceneTelemetryEl.textContent =
      `Cycle ${state.cycle} · PC 0x${state.registers.PC.toString(16).toUpperCase().padStart(4, '0')} · SP 0x${state.registers.SP.toString(16).toUpperCase().padStart(4, '0')}`;

    if (vramDirty) {
      pixelDisplay.render(state.vram);
      pixelCanvas.classList.add('visible');
    } else {
      pixelCanvas.classList.remove('visible');
    }
    updateRegisters(registersEl, state);
    updateCurrentInstruction(instructionEl, state);
    updateStackView(stackEl, state);
    cycleCountEl.textContent = state.cycle.toString();

    // Narration — human-readable description of next instruction
    updateNarration(narrationEl, state);

    // Memory stats
    const codeEnd = currentMetadata ? currentMetadata.codeEnd : -1;
    updateMemoryStats(memoryStatsEl, computeMemoryStats(state, codeEnd));
    updateDisplayStats(state);

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

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (view === 'scene' || view === 'memory') {
        setWorkspaceView(view);
      }
    });
  });

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
    resetDisplayState();
    // Reload bytecode if we have metadata
    if (currentMetadata) {
      const source = editorEl.value;
      const build = buildSource(source, languageSelect.value as SourceLanguage);
      if (build.result && build.errors.length === 0) {
        loadBytecode(vm, build.result);
      }
    }
    controller.setState(vm);
  });

  // 5. Wire speed slider (map 0-100 to roughly 1-100000 via Math.pow(10, val/20))
  function updateSpeed(): void {
    const val = parseInt(speedSlider.value, 10);
    const ips = Math.round(Math.pow(10, val / 20));
    controller.setSpeed(ips);
    speedDisplay.textContent = ips >= 1000 ? `${(ips / 1000).toFixed(1)}k/s` : `${ips}/s`;
  }
  speedSlider.addEventListener('input', updateSpeed);
  updateSpeed();

  examplesDropdown.addEventListener('change', () => {
    speedSlider.value = RECOMMENDED_SPEEDS[examplesDropdown.value] ?? '50';
    updateSpeed();
  });

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
    resetDisplayState();
    updateSpeed();
    renderState(vm);
  });

  // Helper to load bytecode into VM state
  function loadBytecode(state: VMState, result: AssemblerResult): void {
    state.memory.set(result.bytecode);
    currentMetadata = result.metadata;
    hexGrid.setMetadata(result.metadata);
    vramDirty = result.bytecode.some(byte => VramOpcodes.has(byte));
  }

  // 7. Set up editor with onAssemble callback
  setupEditor(editorEl, examplesDropdown, languageSelect, assembleBtn, assemblerErrors, (result: AssemblerResult) => {
    controller.pause();
    controller.reset();
    vm = createVM(memorySize);
    timeTravel = new TimeTravel();
    controller = createController(vm, timeTravel);
    controller.onStateChange(renderState);
    resetDisplayState();
    loadBytecode(vm, result);
    controller.setState(vm);
  });

  // 8. Load default bubble sort example into editor
  editorEl.value = BUBBLE_SORT_SOURCE;
  examplesDropdown.value = 'bubble-sort';
  languageSelect.value = 'assembly';

  // Assemble and load the default program
  const defaultBuild = buildSource(BUBBLE_SORT_SOURCE, 'assembly');
  if (defaultBuild.result && defaultBuild.errors.length === 0) {
    loadBytecode(vm, defaultBuild.result);
    controller.setState(vm);
  }

  // 9. Initial render
  resetDisplayState();
  setWorkspaceView('scene');
  renderState(vm);

  // 10. Handle window resize
  window.addEventListener('resize', () => {
    cpuScene.resize();
    renderState(controller.getState());
  });
}

// Boot
inject();
init();
