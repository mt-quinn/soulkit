import { create } from 'zustand';

export interface LlmBarChip {
  id: string;
  label: string;
}

export interface LlmBarConfig {
  placeholder: string;
  submitLabel: string;
  chips: LlmBarChip[];
  disabled: boolean;
  disabledReason?: string;
  busy: boolean;
  onSubmit?: (prompt: string) => Promise<void> | void;
}

interface LlmBarState {
  prompt: string;
  config: LlmBarConfig;
  setPrompt: (prompt: string) => void;
  setConfig: (config: Partial<LlmBarConfig>) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG: LlmBarConfig = {
  placeholder: 'LLM input unavailable in this view.',
  submitLabel: 'Run',
  chips: [],
  disabled: true,
  disabledReason: 'Switch to a workspace with active LLM context.',
  busy: false,
};

export const useLlmBarStore = create<LlmBarState>((set) => ({
  prompt: '',
  config: DEFAULT_CONFIG,
  setPrompt: (prompt) => set({ prompt }),
  setConfig: (config) =>
    set((state) => ({
      config: {
        ...state.config,
        ...config,
      },
    })),
  resetConfig: () => set({ config: DEFAULT_CONFIG }),
}));
