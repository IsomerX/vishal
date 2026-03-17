import { ProgramMetadata } from '../assembler/types';

export const COLORS = {
  code:     { bg: '#1a2e1a', text: '#7fff7f', label: 'Code' },
  data:     { bg: '#1a1a2e', text: '#7f7fff', label: 'Data' },
  stack:    { bg: '#2e2a1a', text: '#ffcf7f', label: 'Stack' },
  free:     { bg: '#12151a', text: '#4a5568', label: 'Free' },
  pcHighlight:    '#4ade80',
  changedFlash:   '#ffffff',
  cellBorder:     '#1e2530',
};

export type CellRegion = 'code' | 'data' | 'stack' | 'free';

export function getCellRegion(
  address: number, metadata: ProgramMetadata | null, sp: number, memorySize: number
): CellRegion {
  if (metadata) {
    if (address >= metadata.codeStart && address <= metadata.codeEnd) return 'code';
    if (address >= metadata.dataStart && address <= metadata.dataEnd) return 'data';
  }
  if (address > sp && address < memorySize) return 'stack';
  return 'free';
}
