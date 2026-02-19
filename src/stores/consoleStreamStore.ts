import { create } from 'zustand';

const MAX_BUFFER_CHARS = 140000;

function nowStamp(): string {
  return new Date().toLocaleTimeString();
}

function trimBuffer(value: string): string {
  if (value.length <= MAX_BUFFER_CHARS) return value;
  return value.slice(value.length - MAX_BUFFER_CHARS);
}

interface ConsoleStreamState {
  isOpen: boolean;
  openedManually: boolean;
  activeRuns: number;
  buffer: string;
  nextRunId: number;
  open: () => void;
  close: () => void;
  clear: () => void;
  startRun: (label?: string) => number;
  appendToken: (token: string) => void;
  endRun: (runId: number) => void;
}

export const useConsoleStreamStore = create<ConsoleStreamState>((set, get) => ({
  isOpen: false,
  openedManually: false,
  activeRuns: 0,
  buffer: '',
  nextRunId: 1,

  open: () => set({ isOpen: true, openedManually: true }),
  close: () => set((state) => (state.activeRuns > 0 ? state : { ...state, isOpen: false, openedManually: false })),
  clear: () => set({ buffer: '' }),

  startRun: (label = 'LLM run') => {
    const runId = get().nextRunId;
    set((state) => {
      const header = `[${nowStamp()}] >>> ${label}\n`;
      return {
        isOpen: true,
        activeRuns: state.activeRuns + 1,
        nextRunId: runId + 1,
        buffer: trimBuffer(`${state.buffer}${state.buffer ? '\n' : ''}${header}`),
      };
    });
    return runId;
  },

  appendToken: (token) => {
    if (!token) return;
    set((state) => ({
      buffer: trimBuffer(`${state.buffer}${token}`),
    }));
  },

  endRun: (runId) => {
    set((state) => {
      const nextRuns = Math.max(0, state.activeRuns - 1);
      const footer = `\n[${nowStamp()}] <<< complete #${runId}\n`;
      return {
        isOpen: nextRuns > 0 ? true : state.openedManually,
        activeRuns: nextRuns,
        buffer: trimBuffer(`${state.buffer}${footer}`),
      };
    });
  },
}));
