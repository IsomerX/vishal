import { VMState } from '../vm/types';
import { step } from '../vm/vm';
import { TimeTravel } from '../vm/time-travel';

export interface VMController {
  getState(): VMState;
  setState(state: VMState): void;
  step(): void;
  stepBack(): void;
  run(): void;
  pause(): void;
  reset(): void;
  isRunning(): boolean;
  onStateChange(callback: (state: VMState) => void): void;
  setSpeed(instructionsPerSecond: number): void;
}

export function createController(
  initialState: VMState,
  timeTravel: TimeTravel,
): VMController {
  let state = initialState;
  let running = false;
  let animFrameId: number | null = null;
  let speed = 100; // instructions per second
  let lastFrameTime: number | null = null;
  let stepDebt = 0; // fractional steps accumulated across frames
  const listeners: Array<(state: VMState) => void> = [];

  function notify(): void {
    for (const cb of listeners) {
      cb(state);
    }
  }

  function doStep(): void {
    if (state.halted) return;
    timeTravel.record(state);
    state = step(state);
    notify();
  }

  function animationLoop(timestamp: number): void {
    if (!running) return;

    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
      animFrameId = requestAnimationFrame(animationLoop);
      return;
    }

    const elapsed = (timestamp - lastFrameTime) / 1000; // seconds
    lastFrameTime = timestamp;

    // Accumulate fractional steps — at 1 step/sec, we add ~0.016 per frame
    // and only execute when we've accumulated >= 1 full step
    stepDebt += elapsed * speed;
    const stepsToRun = Math.min(Math.floor(stepDebt), 500);
    stepDebt -= stepsToRun;

    for (let i = 0; i < stepsToRun; i++) {
      if (state.halted) {
        running = false;
        stepDebt = 0;
        notify();
        return;
      }
      timeTravel.record(state);
      state = step(state);
    }

    if (stepsToRun > 0) notify();
    animFrameId = requestAnimationFrame(animationLoop);
  }

  return {
    getState(): VMState {
      return state;
    },

    setState(newState: VMState): void {
      state = newState;
      notify();
    },

    step(): void {
      doStep();
    },

    stepBack(): void {
      const prev = timeTravel.stepBack();
      if (prev) {
        state = prev;
        notify();
      }
    },

    run(): void {
      if (running || state.halted) return;
      running = true;
      lastFrameTime = null;
      stepDebt = 0;
      animFrameId = requestAnimationFrame(animationLoop);
      notify();
    },

    pause(): void {
      running = false;
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      lastFrameTime = null;
      stepDebt = 0;
      notify();
    },

    reset(): void {
      running = false;
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      lastFrameTime = null;
      stepDebt = 0;
      timeTravel.reset();
      // Caller is responsible for providing fresh VM state via setState
      notify();
    },

    isRunning(): boolean {
      return running;
    },

    onStateChange(callback: (state: VMState) => void): void {
      listeners.push(callback);
    },

    setSpeed(instructionsPerSecond: number): void {
      speed = Math.max(1, instructionsPerSecond);
    },
  };
}
