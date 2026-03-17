import { VMState } from './types';
import { cloneState } from './vm';

export class TimeTravel {
  private history: VMState[] = [];
  private maxSize: number;

  constructor(maxSize = 50_000) {
    this.maxSize = maxSize;
  }

  get length(): number { return this.history.length; }

  get minCycle(): number | null {
    return this.history.length > 0 ? this.history[0].cycle : null;
  }

  record(state: VMState): void {
    this.history.push(cloneState(state));
    if (this.history.length > this.maxSize) this.history.shift();
  }

  stepBack(): VMState | null {
    if (this.history.length < 2) return null;
    this.history.pop(); // Remove current
    return cloneState(this.history[this.history.length - 1]);
  }

  jumpTo(cycle: number): VMState | null {
    const entry = this.history.find(s => s.cycle === cycle);
    if (!entry) return null;
    const idx = this.history.indexOf(entry);
    this.history = this.history.slice(0, idx + 1);
    return cloneState(entry);
  }

  reset(): void { this.history = []; }
}
