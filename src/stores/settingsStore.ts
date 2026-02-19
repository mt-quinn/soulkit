import { create } from 'zustand';
import type { AppSettings, LLMProvider } from '@/types';
import { storage } from '@/lib/storage';

const SETTINGS_FILE = 'settings.json';

const defaultSettings: AppSettings = {
  theme: 'dark',
  apiKeys: {
    openai: '',
    anthropic: '',
    gemini: '',
  },
  defaultProvider: 'openai',
  defaultTemperature: 0.8,
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setApiKey: (provider: LLMProvider, key: string) => Promise<void>;
  setTheme: (theme: AppSettings['theme']) => void;
  getApiKey: (provider: LLMProvider) => string;
  hasApiKey: (provider: LLMProvider) => boolean;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,

  loadSettings: async () => {
    try {
      const saved = await storage.readJson<AppSettings>(SETTINGS_FILE);
      const merged = { ...defaultSettings, ...saved, apiKeys: { ...defaultSettings.apiKeys, ...saved.apiKeys } };
      set({ settings: merged, loaded: true });
      applyTheme(merged.theme);
    } catch {
      set({ settings: defaultSettings, loaded: true });
      applyTheme(defaultSettings.theme);
    }
  },

  saveSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });
    await storage.writeJson(SETTINGS_FILE, updated);
  },

  setApiKey: async (provider, key) => {
    const current = get().settings;
    const updated = {
      ...current,
      apiKeys: { ...current.apiKeys, [provider]: key },
    };
    set({ settings: updated });
    await storage.writeJson(SETTINGS_FILE, updated);
  },

  setTheme: (theme) => {
    const current = get().settings;
    const updated = { ...current, theme };
    set({ settings: updated });
    applyTheme(theme);
    storage.writeJson(SETTINGS_FILE, updated);
  },

  getApiKey: (provider) => get().settings.apiKeys[provider],

  hasApiKey: (provider) => {
    const key = get().settings.apiKeys[provider];
    return key !== undefined && key.trim().length > 0;
  },
}));

function applyTheme(theme: AppSettings['theme']) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}
