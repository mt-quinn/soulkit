import { create } from 'zustand';
import type { AppSettings } from '@/types';
import { storage } from '@/lib/storage';

const SETTINGS_FILE = 'settings.json';

const defaultSettings: AppSettings = {
  theme: 'dark',
  apiKeys: {
    openai: '',
  },
  ui: {
    skipDeleteConfirmations: {
      schemas: false,
      profiles: false,
    },
  },
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  setTheme: (theme: AppSettings['theme']) => void;
  setDeleteWarningSuppressed: (target: 'schemas' | 'profiles', suppressed: boolean) => Promise<void>;
  getApiKey: () => string;
  hasApiKey: () => boolean;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,

  loadSettings: async () => {
    try {
      const saved = await storage.readJson<AppSettings>(SETTINGS_FILE);
      const savedUi = saved.ui ?? {};
      const merged = {
        ...defaultSettings,
        ...saved,
        apiKeys: { ...defaultSettings.apiKeys, ...saved.apiKeys },
        ui: {
          ...defaultSettings.ui,
          ...savedUi,
          skipDeleteConfirmations: {
            ...defaultSettings.ui.skipDeleteConfirmations,
            ...(savedUi.skipDeleteConfirmations ?? {}),
          },
        },
      };
      set({ settings: merged, loaded: true });
      applyTheme(merged.theme);
    } catch {
      set({ settings: defaultSettings, loaded: true });
      applyTheme(defaultSettings.theme);
    }
  },

  saveSettings: async (partial) => {
    const current = get().settings;
    const updated = {
      ...current,
      ...partial,
      apiKeys: {
        ...current.apiKeys,
        ...(partial.apiKeys ?? {}),
      },
      ui: {
        ...current.ui,
        ...(partial.ui ?? {}),
        skipDeleteConfirmations: {
          ...current.ui.skipDeleteConfirmations,
          ...(partial.ui?.skipDeleteConfirmations ?? {}),
        },
      },
    };
    set({ settings: updated });
    await storage.writeJson(SETTINGS_FILE, updated);
  },

  setApiKey: async (key) => {
    const current = get().settings;
    const updated = {
      ...current,
      apiKeys: { openai: key },
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

  setDeleteWarningSuppressed: async (target, suppressed) => {
    const current = get().settings;
    const updated: AppSettings = {
      ...current,
      ui: {
        ...current.ui,
        skipDeleteConfirmations: {
          ...current.ui.skipDeleteConfirmations,
          [target]: suppressed,
        },
      },
    };
    set({ settings: updated });
    await storage.writeJson(SETTINGS_FILE, updated);
  },

  getApiKey: () => get().settings.apiKeys.openai,

  hasApiKey: () => {
    const key = get().settings.apiKeys.openai;
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
